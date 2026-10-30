import { ArchiveError, writeArchive } from "./archive";
import { applicableFiles, detectBackends } from "./backends";
import { collectImportBlobs, matchManifestFiles } from "./importFiles";
import { findModel, MODEL_CATALOG } from "./catalog";
import { checkModelCompatibility, type ModelIncompatibility } from "./compatibility";
import { MODEL_KINDS } from "./kinds";
import { readRecords, writeRecord } from "./records";
import { deleteVersion, hasAllFiles, hasStorageHeadroom, purgeUnreferencedFiles, readStoredFiles, storeFiles } from "./store";
import { fetchFromMirrors, newTransfer, TransferError, type PartialTransfer } from "./transfer";
import type { ModelFailure, ModelManifest, ModelRecord } from "./types";
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
  return false;
}

async function inspect(manifest: ModelManifest): Promise<ModelView> {
  await detectBackends();
  const base = blankView(manifest);
  const incompatibility = await checkModelCompatibility(manifest);
  if (incompatibility) return { ...base, status: "unsupported", incompatibility, record: readRecords()[manifest.id] ?? null };
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

async function commit(manifest: ModelManifest, blobs: ReadonlyMap<string, Blob>, origin: ModelRecord["origin"]): Promise<void> {
  patch(manifest.id, { status: "verifying" });
  const hashes: Record<string, string> = {};
  for (const file of applicableFiles(manifest)) {
    const blob = blobs.get(file.name);
    if (!blob) throw new ModelInstallError("missing", file.name);
    hashes[file.name] = await sha256Hex(blob);
    if (file.sha256 && file.sha256.toLowerCase() !== hashes[file.name]) throw new ModelInstallError(origin === "upload" ? "mismatch" : "integrity");
  }
  const previous = readRecords()[manifest.id];
  await storeFiles(manifest, blobs);
  const record: ModelRecord = { version: manifest.version, installedAt: Date.now(), bytes: [...blobs.values()].reduce((sum, blob) => sum + blob.size, 0), origin, adapter: manifest.runtime.adapter, enabled: previous?.enabled ?? true, hashes, updated: previous ? true : undefined };
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
  patch(id, { status: "downloading", failure: null, detail: null });
  let loaded = [...session.values()].reduce((sum, transfer) => sum + transfer.received, 0);
  const onBytes = (bytes: number): void => {
    if (controller.signal.aborted) return;
    loaded += bytes;
    patch(id, { loaded, status: "downloading", total: Math.max(manifest.sizeHint, loaded) });
  };
  try {
    await detectBackends();
    void installCompanions(manifest);
    if (!(await hasStorageHeadroom(manifest.sizeHint))) throw new ModelInstallError("storage");
    const blobs = new Map<string, Blob>(staged.get(id));
    for (const file of applicableFiles(manifest)) {
      if (blobs.has(file.name)) continue;
      if (!file.urls) throw new ModelInstallError("missing", file.name);
      const transfer = session.get(file.name) ?? newTransfer();
      session.set(file.name, transfer);
      blobs.set(file.name, await fetchFromMirrors(file.urls, transfer, controller.signal, onBytes));
    }
    await commit(manifest, blobs, "download");
  } catch (error) {
    if (!controller.signal.aborted) fail(manifest, error, true);
  } finally {
    if (controllers.get(id) === controller) controllers.delete(id);
  }
}

function installCompanions(manifest: ModelManifest): Promise<void[]> {
  return Promise.all((manifest.companions ?? []).map(async (companionId) => {
    const view = findModel(companionId) && modelView(companionId);
    if (view && !view.record && (view.status === "absent" || view.status === "failed")) await installModel(companionId);
  }));
}

export function pauseModelInstall(id: string): void {
  const controller = controllers.get(id);
  if (!controller) return;
  controller.abort();
  controllers.delete(id);
  patch(id, { status: "paused" });
}

export const isDownloadable = (manifest: ModelManifest): boolean => applicableFiles(manifest).every(({ urls }) => urls?.length);

async function assertTrustedUpload(manifest: ModelManifest, files: readonly File[], blobs: ReadonlyMap<string, Blob>): Promise<void> {
  for (const file of manifest.files) {
    const blob = blobs.get(file.name);
    if (blob && file.sha256 && file.sha256.toLowerCase() !== (await sha256Hex(blob))) throw new ModelInstallError("mismatch", file.name);
  }
  const expected = manifest.package?.sha256?.toLowerCase();
  if (!expected || manifest.files.every(({ sha256 }) => sha256)) return;
  for (const archive of files.filter(({ name }) => /\.zip$/i.test(name))) {
    if ((await sha256Hex(archive)) !== expected) throw new ModelInstallError("mismatch", archive.name);
  }
}

export async function importModelFiles(id: string, files: readonly File[]): Promise<void> {
  const manifest = findModel(id);
  const current = manifest && modelView(id);
  if (!manifest || !current || ["downloading", "verifying", "unsupported"].includes(current.status)) return;
  try {
    await detectBackends();
    const { blobs } = matchManifestFiles(manifest, await collectImportBlobs(files, manifest.sizeHint));
    if (!blobs.size && !staged.get(id)?.size) throw new ModelInstallError("missing", applicableFiles(manifest).map(({ name }) => name).join(", "));
    await assertTrustedUpload(manifest, files, blobs);
    const received = staged.get(id) ?? new Map<string, Blob>();
    blobs.forEach((blob, name) => received.set(name, blob));
    staged.set(id, received);
    if (applicableFiles(manifest).some(({ name }) => !received.has(name))) {
      patch(id, { staged: [...received.keys()], failure: null, detail: null });
      return;
    }
    patch(id, { status: "verifying", failure: null, detail: null, loaded: 0 });
    await commit(manifest, received, "upload");
  } catch (error) {
    fail(manifest, error, false);
  }
}

export async function exportModelPackage(id: string): Promise<{ blob: Blob; filename: string } | null> {
  const manifest = findModel(id);
  const record = readRecords()[id];
  if (!manifest || !record) return null;
  return { blob: await writeArchive(await readStoredFiles(manifest, record.version)), filename: `${manifest.id}-${record.version}.zip` };
}

export function discardStagedFiles(id: string): void {
  staged.delete(id);
  patch(id, { staged: [] });
}

export async function checkModelUpdates(): Promise<void> {
  updateCheck = { phase: "checking", available: 0 };
  emit();
  try {
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
