import { ArchiveError, readArchive } from "./archive";
import { findModel, isPinned, MODEL_CATALOG } from "./catalog";
import type { ModelIncompatibility } from "./compatibility";
import { MODEL_KINDS } from "./kinds";
import { readRecords, writeRecord } from "./records";
import { deleteVersion, hasAllFiles, hasStorageHeadroom, storeFiles } from "./store";
import { fetchResumable, newTransfer, TransferError, type PartialTransfer } from "./transfer";
import type { ModelFailure, ModelManifest, ModelRecord } from "./types";
import { sha256Hex } from "./verify";

export type ModelStatus = "unsupported" | "absent" | "downloading" | "verifying" | "failed" | "installed";

export interface ModelView {
  manifest: ModelManifest;
  status: ModelStatus;
  loaded: number;
  total: number;
  failure: ModelFailure | null;
  incompatibility: ModelIncompatibility | null;
  record: ModelRecord | null;
  updateAvailable: boolean;
  pinned: boolean;
}

type Listener = () => void;

const views = new Map<string, ModelView>();
const controllers = new Map<string, AbortController>();
const transfers = new Map<string, Map<string, PartialTransfer>>();
const listeners = new Set<Listener>();

const emit = (): void => listeners.forEach((listener) => listener());

const blankView = (manifest: ModelManifest): ModelView => ({ manifest, status: "absent", loaded: 0, total: manifest.sizeHint, failure: null, incompatibility: null, record: null, updateAvailable: false, pinned: isPinned(manifest) });

function patch(id: string, update: Partial<ModelView>): void {
  const current = views.get(id);
  if (current) views.set(id, { ...current, ...update });
  emit();
}

export function subscribeModels(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function modelView(id: string): ModelView {
  const manifest = findModel(id)!;
  if (!views.has(id)) views.set(id, blankView(manifest));
  return views.get(id)!;
}

export const listModelViews = (): ModelView[] => MODEL_CATALOG.map(({ id }) => modelView(id));

export const isModelReady = (id: string): boolean => {
  const view = modelView(id);
  return view.status === "installed" && view.record?.enabled === true;
};

async function inspect(manifest: ModelManifest): Promise<ModelView> {
  const base = blankView(manifest);
  const incompatibility = await MODEL_KINDS[manifest.kind].check();
  if (incompatibility) return { ...base, status: "unsupported", incompatibility };
  const record = readRecords()[manifest.id];
  if (!record || !(await hasAllFiles(manifest, record.version).catch(() => false))) {
    if (record) writeRecord(manifest.id, null);
    return base;
  }
  return { ...base, status: "installed", record, updateAvailable: record.version !== manifest.version };
}

export async function refreshModels(): Promise<void> {
  await Promise.all(
    MODEL_CATALOG.map(async (manifest) => {
      const active = views.get(manifest.id)?.status;
      if (active === "downloading" || active === "verifying") return;
      views.set(manifest.id, await inspect(manifest));
    }),
  );
  emit();
}

async function commit(manifest: ModelManifest, blobs: ReadonlyMap<string, Blob>, origin: ModelRecord["origin"]): Promise<void> {
  patch(manifest.id, { status: "verifying" });
  const hashes: Record<string, string> = {};
  for (const file of manifest.files) {
    const blob = blobs.get(file.name);
    if (!blob) throw new ModelInstallError("missing");
    hashes[file.name] = await sha256Hex(blob);
    if (file.sha256 && file.sha256.toLowerCase() !== hashes[file.name]) throw new ModelInstallError(origin === "manual" ? "mismatch" : "integrity");
  }
  const previous = readRecords()[manifest.id];
  await storeFiles(manifest, blobs);
  const record: ModelRecord = { version: manifest.version, installedAt: Date.now(), bytes: [...blobs.values()].reduce((sum, blob) => sum + blob.size, 0), origin, enabled: previous?.enabled ?? true, hashes };
  writeRecord(manifest.id, record);
  if (previous && previous.version !== manifest.version) await deleteVersion(manifest, previous.version).catch(() => undefined);
  transfers.delete(manifest.id);
  views.set(manifest.id, { ...blankView(manifest), status: "installed", record });
  emit();
}

class ModelInstallError extends Error {
  constructor(readonly failure: ModelFailure) {
    super(failure);
  }
}

const failureOf = (error: unknown): ModelFailure => {
  if (error instanceof ModelInstallError || error instanceof TransferError) return error.failure;
  return error instanceof ArchiveError ? "archive" : "storage";
};

function fail(manifest: ModelManifest, error: unknown, keepProgress: boolean): void {
  const failure = failureOf(error);
  if (!keepProgress || failure !== "network") transfers.delete(manifest.id);
  patch(manifest.id, { status: "failed", failure, loaded: keepProgress && failure === "network" ? modelView(manifest.id).loaded : 0 });
}

export async function installModel(id: string): Promise<void> {
  const manifest = findModel(id);
  const current = manifest && modelView(id);
  if (!manifest || !current || ["downloading", "verifying", "unsupported"].includes(current.status)) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  const session = transfers.get(id) ?? new Map<string, PartialTransfer>();
  transfers.set(id, session);
  patch(id, { status: "downloading", failure: null });
  let loaded = [...session.values()].reduce((sum, transfer) => sum + transfer.received, 0);
  const onBytes = (bytes: number): void => {
    loaded += bytes;
    patch(id, { loaded, status: "downloading", total: Math.max(manifest.sizeHint, loaded) });
  };
  try {
    if (!(await hasStorageHeadroom(manifest.sizeHint))) throw new ModelInstallError("storage");
    const blobs = new Map<string, Blob>();
    for (const file of manifest.files) {
      const transfer = session.get(file.name) ?? newTransfer();
      session.set(file.name, transfer);
      blobs.set(file.name, await fetchResumable(file.url, transfer, controller.signal, onBytes));
    }
    await commit(manifest, blobs, "cloud");
  } catch (error) {
    if (!controller.signal.aborted) fail(manifest, error, true);
  } finally {
    controllers.delete(id);
  }
}

export async function importModelPackage(id: string, file: File): Promise<void> {
  const manifest = findModel(id);
  const current = manifest && modelView(id);
  if (!manifest || !current || ["downloading", "verifying", "unsupported"].includes(current.status)) return;
  if (!isPinned(manifest)) return patch(id, { status: "failed", failure: "unpinned" });
  patch(id, { status: "verifying", failure: null, loaded: 0 });
  try {
    await commit(manifest, await readArchive(file, manifest.sizeHint), "manual");
  } catch (error) {
    fail(manifest, error, false);
  }
}

export function cancelModelInstall(id: string): void {
  controllers.get(id)?.abort();
  controllers.delete(id);
  transfers.delete(id);
  const manifest = findModel(id);
  if (manifest) void inspect(manifest).then((view) => {
    views.set(id, view);
    emit();
  });
}

export async function removeModel(id: string): Promise<void> {
  const manifest = findModel(id);
  if (!manifest) return;
  const record = readRecords()[id];
  if (record) await deleteVersion(manifest, record.version).catch(() => undefined);
  writeRecord(id, null);
  transfers.delete(id);
  views.set(id, await inspect(manifest));
  emit();
}

export function setModelEnabled(id: string, enabled: boolean): void {
  const record = readRecords()[id];
  if (!record) return;
  const next = { ...record, enabled };
  writeRecord(id, next);
  patch(id, { record: next });
}
