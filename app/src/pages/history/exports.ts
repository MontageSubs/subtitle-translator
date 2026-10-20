import type { HistoryJob, HistorySubtitle } from "../../lib/history/history";
import { exportHistoryBackup } from "../../lib/history/historyBackup";
import { renderHistorySubtitle } from "../../lib/history/historyRender";
import { buildOutputZip, withDirectoryOf } from "../../lib/subtitle/archive";
import { saveBlob } from "../../utils/download";

function mimeFor(format: HistorySubtitle["format"]): string {
  return format === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8";
}

function renderTranslated(job: HistoryJob, subtitle: HistorySubtitle): string {
  return renderHistorySubtitle(subtitle, false, job.sourceLang, job.targetLang, Boolean(job.stripSdh));
}

export function downloadSubtitle(job: HistoryJob, subtitle: HistorySubtitle): void {
  saveBlob(new Blob([renderTranslated(job, subtitle)], { type: mimeFor(subtitle.format) }), subtitle.filename);
}

async function downloadJobAsZip(job: HistoryJob): Promise<void> {
  const files = job.subtitles.map((subtitle) => ({
    path: withDirectoryOf(subtitle.relativePath, subtitle.filename),
    content: renderTranslated(job, subtitle),
  }));
  saveBlob(await buildOutputZip(files), `${job.title || "subtitles"}.zip`);
}

export async function downloadJob(job: HistoryJob): Promise<void> {
  if (job.subtitles.length === 1) downloadSubtitle(job, job.subtitles[0]);
  else if (job.subtitles.length > 1) await downloadJobAsZip(job);
}

export async function downloadHistoryBackup(): Promise<void> {
  const { blob, extension } = await exportHistoryBackup();
  saveBlob(blob, `subtitle-translator-history-${new Date().toISOString().slice(0, 10)}.${extension}`);
}
