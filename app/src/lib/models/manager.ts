import { sha256Hex } from "../../utils/digest";
import { DELETION_UNDO_WINDOW_MS, cancelDeletion, deletionRemainingMs, isDeletionQueued, queueDeletion } from "../history/deletionQueue";
import { TransferError } from "../net/transferError";
import { ArchiveError, writeArchive } from "./archive";
import { applicableFiles, detectBackends } from "./backends";
import { collectImportBlobs, matchManifestFiles } from "./importFiles";
import { findModel, modelCatalog } from "./catalog";
import { fetchModelCatalog, restoreStoredCatalog } from "./catalogSync";
import { ensureRuntimeCached, hasRuntimeAssets, purgeIdleRuntime, runtimeTransferProgress, subscribeRuntimeTransfers } from "./runtime/ortAssets";
import { checkModelCompatibility, type ModelIncompatibility } from "./compatibility";
import { MODEL_KINDS } from "./kinds";
import { readRecords, writeRecord } from "./records";
import { deleteVersion, hasRequiredFiles, hasStorageHeadroom, purgeUnreferencedFiles, readStoredFiles, storeFiles } from "./store";
import { downloadUrls } from "./sources";
import { openDownloadSession, type DownloadSession } from "./download/downloadSession";
import type { ModelFailure, ModelManifest, ModelRecord } from "./types";

export type ModelStatus = "unsupported" | "absent" | "downloading" | "paused" | "verifying" | "failed" | "installed";

type UpdateCheckPhase = "idle" | "checking" | "done" | "failed";

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
  awaitingBytes: boolean;
  dependency: ModelDependencyProgress | null;
}

export interface ModelDependencyProgress {
  name: string;
  loaded: number;
  total: number;
}

type Listener = () => void;

const views = new Map<string, ModelView>();
const controllers = new Map<string, AbortController>();
const sessions = new Map<string, DownloadSession>();
const listeners = new Set<Listener>();
const staged = new Map<string, Map<string, Blob>>();
const FALLBACK_ARCHIVE_LIMIT_BYTES = 1024 * 1024 * 1024;
const downloaded = new Map<string, Map<string, Blob>>();

function discardSession(id: string): void {
  sessions.get(id)?.discard();
  sessions.delete(id);
}
const inspectionTickets = new Map<string, number>();
let ticketCounter = 0;
let updateCheck: UpdateCheckState = { phase: "idle", available: 0 };

const emit = (): void => listeners.forEach((listener) => listener());

const blankView = (manifest: ModelManifest): ModelView => ({ manifest, status: "absent", loaded: 0, total: manifest.bytes ?? 0, failure: null, detail: null, incompatibility: null, record: null, updateAvailable: false, staged: [...(staged.get(manifest.id)?.keys() ?? [])], awaitingBytes: false, dependency: null });

const invalidateInspection = (id: string): void => void inspectionTickets.set(id, ++ticketCounter);

function setView(id: string, view: ModelView): void {
  invalidateInspection(id);
  views.set(id, view);
}

function patch(id: string, update: Partial<ModelView>): void {
  const current = views.get(id);
  if (current) setView(id, { ...current, ...update });
  emit();
}

export function subscribeModels(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function modelView(id: string): ModelView {
  const manifest = findModel(id)!;
  const view = views.get(id) ?? blankView(manifest);
  const current = view.manifest === manifest ? view : { ...view, manifest };
  views.set(id, current);
  return current;
}

export const listModelViews = (): ModelView[] => modelCatalog().map(({ id }) => modelView(id));

const removalKey = (id: string): string => `models:${id}`;

export const isRemovalPending = (id: string): boolean => isDeletionQueued(removalKey(id));

export const removalSecondsLeft = (id: string): number | null => (isRemovalPending(id) ? Math.max(1, Math.ceil(deletionRemainingMs(removalKey(id)) / 1000)) : null);

export const isModelInstalled = (id: string): boolean => modelView(id).status === "installed" && !isRemovalPending(id);

export const isModelReady = (id: string): boolean => isModelInstalled(id) && modelView(id).record?.enabled === true;

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
  if (!record) return base;
  const present = await hasRequiredFiles(manifest, record.version).catch(() => null);
  if (present === false) {
    writeRecord(manifest.id, null);
    return base;
  }
  return { ...base, status: "installed", record, updateAvailable: updateAvailableFor(manifest, record) };
}

async function purgeDeadModelData(): Promise<void> {
  const records = readRecords();
  Object.keys(records).filter((id) => !findModel(id)).forEach((id) => writeRecord(id, null));
  const referenced = new Set(modelCatalog().flatMap(({ id }) => (readRecords()[id] ? [`${id}/${readRecords()[id].version}`] : [])));
  await purgeUnreferencedFiles(referenced).catch(() => undefined);
  if (hasRuntimeAssets()) await purgeIdleRuntime(referenced.size > 0);
}

const CATALOG_DEFERRAL_MS = 20_000;

let catalogRequested = false;
let catalogDeferral: ReturnType<typeof setTimeout> | undefined;

function requestCatalog(urgent: boolean): void {
  if (catalogRequested) return;
  if (!urgent) {
    catalogDeferral ??= setTimeout(() => requestCatalog(true), CATALOG_DEFERRAL_MS);
    return;
  }
  clearTimeout(catalogDeferral);
  catalogRequested = true;
  void fetchModelCatalog().then((changed) => (changed ? refreshModels({ urgent: true }) : undefined));
}

export async function refreshModels({ urgent = false }: { urgent?: boolean } = {}): Promise<void> {
  restoreStoredCatalog();
  requestCatalog(urgent);
  const busy = [...views.values()].some(({ status }) => status === "downloading" || status === "paused" || status === "verifying");
  if (!busy) await purgeDeadModelData();
  await Promise.all(
    modelCatalog().map(async (manifest) => {
      const active = views.get(manifest.id)?.status;
      if (active === "downloading" || active === "paused" || active === "verifying") return;
      const ticket = ++ticketCounter;
      inspectionTickets.set(manifest.id, ticket);
      const inspected = await inspect(manifest);
      if (inspectionTickets.get(manifest.id) === ticket) views.set(manifest.id, inspected);
    }),
  );
  emit();
}

let initialInspection: Promise<void> | null = null;

export function ensureModelsInspected(): Promise<void> {
  initialInspection ??= refreshModels().catch((error: unknown) => {
    initialInspection = null;
    throw error;
  });
  return initialInspection;
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
  discardSession(manifest.id);
  downloaded.delete(manifest.id);
  staged.delete(manifest.id);
  setView(manifest.id, { ...blankView(manifest), status: "installed", record });
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
  if (!keepProgress || failure !== "network") {
    discardSession(manifest.id);
    downloaded.delete(manifest.id);
  }
  patch(manifest.id, { status: "failed", awaitingBytes: false, dependency: null, failure, detail: detailOf(error), loaded: keepProgress && failure === "network" ? modelView(manifest.id).loaded : 0 });
}

export async function installModel(id: string): Promise<void> {
  const manifest = findModel(id);
  const current = manifest && modelView(id);
  if (!manifest || !current || ["downloading", "verifying", "unsupported"].includes(current.status)) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  const session = sessions.get(id) ?? openDownloadSession(id);
  sessions.set(id, session);
  const completed = downloaded.get(id) ?? new Map<string, Blob>();
  downloaded.set(id, completed);
  patch(id, { status: "downloading", failure: null, detail: null, awaitingBytes: true, dependency: null });
  let loaded = await session.received();
  const onBytes = (bytes: number): void => {
    if (controller.signal.aborted) return;
    loaded += bytes;
    patch(id, { loaded, status: "downloading", awaitingBytes: false, total: manifest.bytes ? Math.max(manifest.bytes, loaded) : 0 });
  };
  try {
    await detectBackends();
    void installCompanions(manifest);
    if (!(await hasStorageHeadroom(manifest.bytes ?? 0))) throw new ModelInstallError("storage");
    const blobs = new Map<string, Blob>([...completed, ...(staged.get(id) ?? [])]);
    if (manifest.runtime.format === "onnx" && hasRuntimeAssets()) {
      const webgpu = applicableFiles(manifest).some(({ backend }) => backend === "webgpu");
      const stopWatching = subscribeRuntimeTransfers(() => {
        const progress = runtimeTransferProgress();
        patch(id, { dependency: progress ? { name: progress.file, loaded: progress.loaded, total: progress.total } : null });
      });
      try {
        await ensureRuntimeCached(webgpu ? "webgpu" : "wasm");
      } catch (error) {
        throw controller.signal.aborted ? error : new TransferError("network", "runtime");
      } finally {
        stopWatching();
        patch(id, { dependency: null });
      }
    }
    for (const file of applicableFiles(manifest)) {
      if (blobs.has(file.name)) continue;
      if (!file.urls) throw new ModelInstallError("missing", file.name);
      const blob = await session.retrieve(file.name, downloadUrls(manifest, file), controller.signal, onBytes);
      blobs.set(file.name, blob);
      completed.set(file.name, blob);
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
  patch(id, { status: "paused", awaitingBytes: false, dependency: null });
}

export const isDownloadable = ({ delivery }: ModelManifest): boolean => delivery === "fetch";

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
    const { blobs } = matchManifestFiles(manifest, await collectImportBlobs(files, manifest.bytes ?? FALLBACK_ARCHIVE_LIMIT_BYTES));
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
  discardSession(id);
  downloaded.delete(id);
  const manifest = findModel(id);
  if (manifest) {
    invalidateInspection(id);
    const ticket = inspectionTickets.get(id);
    void inspect(manifest).then((view) => {
      if (inspectionTickets.get(id) !== ticket) return;
      views.set(id, view);
      emit();
    });
  }
}

async function removeModel(id: string): Promise<void> {
  const manifest = findModel(id);
  if (!manifest) return;
  const record = readRecords()[id];
  if (record) await deleteVersion(manifest, record.version).catch(() => undefined);
  writeRecord(id, null);
  discardSession(id);
  downloaded.delete(id);
  const ticket = ++ticketCounter;
  inspectionTickets.set(id, ticket);
  const inspected = await inspect(manifest);
  if (inspectionTickets.get(id) === ticket) views.set(id, inspected);
  emit();
}

export function toggleModelRemoval(id: string): void {
  const manifest = findModel(id);
  if (!manifest) return;
  if (!cancelDeletion(removalKey(id))) {
    MODEL_KINDS[manifest.kind].driver.release();
    queueDeletion(removalKey(id), DELETION_UNDO_WINDOW_MS, () => removeModel(id));
  }
  emit();
}

export function setModelEnabled(id: string, enabled: boolean): void {
  const record = readRecords()[id];
  if (!record) return;
  const next = { ...record, enabled };
  writeRecord(id, next);
  patch(id, { record: next });
}
