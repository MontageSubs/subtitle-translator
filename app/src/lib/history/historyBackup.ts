import { compressToZip } from "../subtitle/archive";
import { unpackText } from "./historyCodec";
import { ensureHistoryId, getHistoryId, getHistoryJob, serializeWrite } from "./history";
import { HISTORY_MAX_JOBS } from "./historyQuota";
import { HISTORY_SCHEMA, readJob, schemaOf } from "./historySchema";
import { getHead, listHeads, putJob } from "./historyStore";

export interface BackupFile {
  blob: Blob;
  extension: string;
}

export interface ImportSummary {
  imported: number;
  updated: number;
  unreadable: number;
  skipped: number;
}

function backupStream(ids: string[], historyId: string | null): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index === 0) controller.enqueue(encoder.encode(`{"schema":${HISTORY_SCHEMA},"historyId":${JSON.stringify(historyId)},"exportedAt":${Date.now()},"jobs":[`));
      if (index >= ids.length) {
        controller.enqueue(encoder.encode("]}"));
        controller.close();
        return;
      }
      const job = await getHistoryJob(ids[index]);
      if (job) controller.enqueue(encoder.encode(`${index ? "," : ""}${JSON.stringify({ ...job, schema: HISTORY_SCHEMA })}`));
      index++;
    },
  });
}

export const BACKUP_ENTRY_NAME = "history.json";

export async function exportHistoryBackup(): Promise<BackupFile> {
  const stream = backupStream((await listHeads()).map((head) => head.id), getHistoryId());
  const json = await new Response(stream).blob();
  return { blob: await compressToZip([{ path: BACKUP_ENTRY_NAME, content: json }]), extension: "zip" };
}

export function backupDeviceTag(): string {
  return getHistoryId()?.split("-").pop() ?? "";
}

export async function importHistoryBackup(file: Blob): Promise<ImportSummary> {
  const parsed = JSON.parse(await unpackText(file));
  const items: unknown = parsed?.jobs;
  if (!Array.isArray(items)) throw new Error("Invalid history backup format");

  ensureHistoryId();
  const summary: ImportSummary = { imported: 0, updated: 0, unreadable: 0, skipped: 0 };
  let total = (await listHeads()).length;

  for (const raw of items) {
    const job = readJob(raw);
    if (!job) {
      if (schemaOf(raw) > HISTORY_SCHEMA) summary.unreadable++;
      continue;
    }
    if (!job.historyId && parsed.historyId) job.historyId = parsed.historyId;
    const existing = await getHead(job.id);
    if (existing && (job.updatedAt || 0) < existing.updatedAt) continue;
    if (!existing && total >= HISTORY_MAX_JOBS) {
      summary.skipped++;
      continue;
    }
    await serializeWrite(() => putJob(job));
    if (existing) summary.updated++;
    else {
      summary.imported++;
      total++;
    }
  }
  return summary;
}
