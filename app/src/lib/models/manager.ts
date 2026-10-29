import { ArchiveError } from "./archive";
import { collectImportBlobs, matchManifestFiles } from "./importFiles";
import { modelFileUrl } from "../../config/models";
import { findModel, MODEL_CATALOG } from "./catalog";
import type { ModelIncompatibility } from "./compatibility";
import { MODEL_KINDS } from "./kinds";
import { readRecords, writeRecord } from "./records";
import { deleteVersion, hasAllFiles, hasStorageHeadroom, purgeUnreferencedFiles, storeFiles } from "./store";
import { fetchWithRetry, newTransfer, TransferError, type PartialTransfer } from "./transfer";
import type { ModelFailure, ModelManifest, ModelRecord } from "./types";
import { fetchLatestRevision } from "./updates";
import { sha256Hex } from "./verify";

export type ModelStatus = "unsupported" | "absent" | "downloading" | "paused" | "verifying" | "failed" | "installed";

export type UpdateCheckPhase = "idle" | "checking" | "done" | "failed";

export interface UpdateCheckState {
  phase: UpdateCheckPhase;
  available: number;
}

export interface ModelView {
  manifest: ModelManifest;
  status: ModelStatus;
  loaded: number;
  total: number;
  failure: ModelFailure | null;
  detail: string | null;
  incompatibility: ModelIncompatibility | null;
  record: ModelRecord | null;
  updateAvailable: boolean;
  staged: readonly string[];
}

type Listener = () => void;

const views = new Map<string, ModelView>();
const controllers = new Map<string, AbortController>();
const transfers = new Map<string, Map<string, PartialTransfer>>();
const listeners = new Set<Listener>();
const staged = new Map<string, Map<string, Blob>>();
const latestRevisions = new Map<string, string>();
let updateCheck: UpdateCheckState = { phase: "idle", available: 0 };

const emit = (): void => listeners.forEach((listener) => listener());

const blankView = (manifest: ModelManifest): ModelView => ({ manifest, status: "absent", loaded: 0, total: manifest.sizeHint, failure: null, detail: null, incompatibility: null, record: null, updateAvailable: false, staged: [...(staged.get(manifest.id)?.keys() ?? [])] });

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

export const updateCheckState = (): UpdateCheckState => updateCheck;

function updateAvailableFor(manifest: ModelManifest, record: ModelRecord): boolean {
  if (record.version !== manifest.version) return true;
  if ((record.adapter ?? MODEL_KINDS[manifest.kind].legacyAdapter) !== manifest.runtime.adapter) return true;
  const latest = latestRevisions.get(manifest.id);
  const installed = record.revision ?? (record.origin === "cloud" ? manifest.revision : null);
  return Boolean(latest && installed && latest !== installed);
}

async function inspect(manifest: ModelManifest): Promise<ModelView> {
  const base = blankView(manifest);
  const incompatibility = await MODEL_KINDS[manifest.kind].check();
  if (incompatibility) return { ...base, status: "unsupported", incompatibility };
  const record = readRecords()[manifest.id];
  if (!record || !(await hasAllFiles(manifest, record.version).catch(() => false))) {
    if (record) writeRecord(manifest.id, null);
    return base;
  }
  return { ...base, status: "installed", record, updateAvailable: updateAvailableFor(manifest, record) };
}

async function purgeDeadModelData(): Promise<void> {
  const records = readRecords();
  Object.keys(records).filter((id) => !findModel(id)).forEach((id) => writeRecord(id, null));
  const referenced = new Set(MODEL_CATALOG.flatMap(({ id }) => (readRecords()[id] ? [`${id}/${readRecords()[id].version}`] : [])));
  await purgeUnreferencedFiles(referenced).catch(() => undefined);
}

export async function refreshModels(): Promise<void> {
  const busy = [...views.values()].some(({ status }) => status === "downloading" || status === "paused" || status === "verifying");
  if (!busy) await purgeDeadModelData();
  await Promise.all(
    MODEL_CATALOG.map(async (manifest) => {
      const active = views.get(manifest.id)?.status;
      if (active === "downloading" || active === "paused" || active === "verifying") return;
      views.set(manifest.id, await inspect(manifest));
    }),
  );
  emit();
}

async function commit(manifest: ModelManifest, blobs: ReadonlyMap<string, Blob>, origin: ModelRecord["origin"], revision?: string): Promise<void> {
  patch(manifest.id, { status: "verifying" });
  const hashes: Record<string, string> = {};
  for (const file of manifest.files) {
    const blob = blobs.get(file.name);
    if (!blob) throw new ModelInstallError("missing", file.name);
    hashes[file.name] = await sha256Hex(blob);
    if (file.sha256 && file.sha256.toLowerCase() !== hashes[file.name]) throw new ModelInstallError(origin === "manual" ? "mismatch" : "integrity");
  }
  const previous = readRecords()[manifest.id];
  await storeFiles(manifest, blobs);
  const record: ModelRecord = { version: manifest.version, installedAt: Date.now(), bytes: [...blobs.values()].reduce((sum, blob) => sum + blob.size, 0), origin, adapter: manifest.runtime.adapter, enabled: previous?.enabled ?? true, hashes, revision: origin === "cloud" ? revision : undefined, updated: previous ? true : undefined };
  writeRecord(manifest.id, record);
  if (previous && previous.version !== manifest.version) await deleteVersion(manifest, previous.version).catch(() => undefined);
  transfers.delete(manifest.id);
  staged.delete(manifest.id);
  views.set(manifest.id, { ...blankView(manifest), status: "installed", record });
  emit();
}

class ModelInstallError extends Error {
  constructor(readonly failure: ModelFailure, readonly detail: string | null = null) {
    super(failure);
  }
}

const failureOf = (error: unknown): ModelFailure => {
  if (error instanceof ModelInstallError || error instanceof TransferError) return error.failure;
  return error instanceof ArchiveError ? "archive" : "storage";
};

const detailOf = (error: unknown): string | null => (error instanceof ModelInstallError || error instanceof TransferError ? error.detail : null);

function fail(manifest: ModelManifest, error: unknown, keepProgress: boolean): void {
  const failure = failureOf(error);
  if (!keepProgress || failure !== "network") transfers.delete(manifest.id);
  patch(manifest.id, { status: "failed", failure, detail: detailOf(error), loaded: keepProgress && failure === "network" ? modelView(manifest.id).loaded : 0 });
}

export async function installModel(id: string): Promise<void> {
  const manifest = findModel(id);
  const current = manifest && modelView(id);
  if (!manifest || !current || ["downloading", "verifying", "unsupported"].includes(current.status)) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  const session = transfers.get(id) ?? new Map<string, PartialTransfer>();
  transfers.set(id, session);
  const revision = (current.record && latestRevisions.get(id)) || manifest.revision;
  patch(id, { status: "downloading", failure: null, detail: null });
  let loaded = [...session.values()].reduce((sum, transfer) => sum + transfer.received, 0);
  const onBytes = (bytes: number): void => {
    if (controller.signal.aborted) return;
    loaded += bytes;
    patch(id, { loaded, status: "downloading", total: Math.max(manifest.sizeHint, loaded) });
  };
  try {
    if (!(await hasStorageHeadroom(manifest.sizeHint))) throw new ModelInstallError("storage");
    const blobs = new Map<string, Blob>(staged.get(id));
    for (const file of manifest.files) {
      if (blobs.has(file.name)) continue;
      const transfer = session.get(file.name) ?? newTransfer();
      session.set(file.name, transfer);
      blobs.set(file.name, await fetchWithRetry(modelFileUrl(manifest.repository, revision, file.path), transfer, controller.signal, onBytes));
    }
    await commit(manifest, blobs, "cloud", revision);
  } catch (error) {
    if (!controller.signal.aborted) fail(manifest, error, true);
  } finally {
    if (controllers.get(id) === controller) controllers.delete(id);
  }
}

export function pauseModelInstall(id: string): void {
  const controller = controllers.get(id);
  if (!controller) return;
  controller.abort();
  controllers.delete(id);
  patch(id, { status: "paused" });
}

export async function importModelFiles(id: string, files: readonly File[]): Promise<void> {
  const manifest = findModel(id);
  const current = manifest && modelView(id);
  if (!manifest || !current || ["downloading", "verifying", "unsupported"].includes(current.status)) return;
  try {
    const { blobs } = matchManifestFiles(manifest, await collectImportBlobs(files, manifest.sizeHint));
    if (!blobs.size && !staged.get(id)?.size) throw new ModelInstallError("missing", manifest.files.map(({ name }) => name).join(", "));
    const received = staged.get(id) ?? new Map<string, Blob>();
    blobs.forEach((blob, name) => received.set(name, blob));
    staged.set(id, received);
    if (manifest.files.some(({ name }) => !received.has(name))) {
      patch(id, { staged: [...received.keys()], failure: null, detail: null });
      return;
    }
    patch(id, { status: "verifying", failure: null, detail: null, loaded: 0 });
    await commit(manifest, received, "manual");
  } catch (error) {
    fail(manifest, error, false);
  }
}

export function discardStagedFiles(id: string): void {
  staged.delete(id);
  patch(id, { staged: [] });
}

export async function checkModelUpdates(): Promise<void> {
  updateCheck = { phase: "checking", available: 0 };
  emit();
  try {
    await Promise.all(MODEL_CATALOG.filter(({ id }) => readRecords()[id]).map(async (manifest) => {
      latestRevisions.set(manifest.id, await fetchLatestRevision(manifest.repository));
    }));
    await refreshModels();
    updateCheck = { phase: "done", available: listModelViews().filter((view) => view.updateAvailable).length };
  } catch {
    updateCheck = { phase: "failed", available: 0 };
  }
  emit();
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
