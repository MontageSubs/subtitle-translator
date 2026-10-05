import { t } from "../../i18n";
import { HistoryCue, HistoryJob, HistorySubtitle, getHistoryJob, updateHistoryJob } from "../../lib/history/history";
import { historyCuesToCues, historyCuesToTopAlignOverrides, renderHistorySubtitle } from "../../lib/history/historyRender";
import { formatSubtitleTime } from "../../lib/subtitle/formats/formatTime";
import { AnCornerOrDefault, resolveTopAlign } from "../../lib/subtitle/formats/topAlign";
import { wrapLine } from "../../lib/subtitle/postprocess/lineWrap";
import { openPreviewModal, PreviewCard } from "../../components/preview";
import { DictionaryEntry, glossaryToEntries } from "../../utils/dictionary";
import { formatDateTime } from "../../utils/formatDate";

function toPlainGlossary(entries: DictionaryEntry[]): Record<string, string> | undefined {
  if (!entries.length) return undefined;
  const glossary: Record<string, string> = {};
  for (const { source, target } of entries) {
    if (source.trim()) glossary[source.trim()] = target.trim();
  }
  return glossary;
}

function toPreviewCards(subtitle: HistorySubtitle, sourceLang: string, targetLang: string): PreviewCard[] {
  const originalById = new Map(historyCuesToCues(subtitle.cues).map((cue) => [cue.id, cue]));
  const overrides = historyCuesToTopAlignOverrides(subtitle.cues);
  const musicTopAlign = Boolean(subtitle.musicTopAlign);
  return subtitle.cues.map((cue) => {
    const topAlign = resolveTopAlign(originalById.get(cue.id), cue.is_music, musicTopAlign, overrides.get(cue.id));
    const target = targetLang && cue.translatedText ? wrapLine(cue.translatedText, targetLang, cue.end_ms - cue.start_ms) : cue.translatedText;
    return {
      id: cue.id,
      start: formatSubtitleTime(cue.start_ms, subtitle.format),
      end: formatSubtitleTime(cue.end_ms, subtitle.format),
      source: cue.sourceText,
      target,
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      sourceLang,
      targetLang,
      topAlignAn: topAlign?.an ?? 2,
    };
  });
}

function applyEdits(subtitle: HistorySubtitle, edits: Map<number, string>, positionEdits?: Map<number, AnCornerOrDefault>): HistoryCue[] {
  return subtitle.cues.map((cue) => {
    const edited = edits.has(cue.id) ? { ...cue, translatedText: edits.get(cue.id)! } : cue;
    return positionEdits?.has(cue.id) ? { ...edited, topAlignOverride: positionEdits.get(cue.id) } : edited;
  });
}

function renderTarget(job: HistoryJob, subtitle: HistorySubtitle): string {
  return renderHistorySubtitle(subtitle, false, job.sourceLang, job.targetLang, Boolean(job.stripSdh));
}

export async function openSubtitlePreview(jobId: string, subtitleId: string): Promise<void> {
  const job = await getHistoryJob(jobId);
  const subtitle = job?.subtitles.find((candidate) => candidate.id === subtitleId) ?? job?.subtitles[0];
  if (!job || !subtitle) return;

  openPreviewModal(
    renderTarget(job, subtitle),
    renderHistorySubtitle(subtitle, true, job.sourceLang, job.targetLang, Boolean(job.stripSdh)),
    toPreviewCards(subtitle, job.sourceLang, job.targetLang),
    {
      lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(job.updatedAt) }),
      initialContext: job.contextText,
      initialGlossary: job.glossary ? glossaryToEntries(job.glossary) : undefined,
      sceneSeconds: job.sceneSeconds,
      sourceFilename: subtitle.sourceFilename || job.sourceFilename || "subtitle.srt",
      translatedFilename: subtitle.translatedFilename || job.translatedFilename || subtitle.filename || "translated.srt",
      sourceLang: job.sourceLang,
      targetLang: job.targetLang,
      outputMode: subtitle.outputMode,
      cueLayout: "single",
      onApply: (edits, contextText, glossaryEntries, positionEdits) => {
        const cues = applyEdits(subtitle, edits, positionEdits);
        subtitle.cues = cues;
        const changes: Partial<HistoryJob> = {
          subtitles: job.subtitles.map((candidate) => (candidate.id === subtitle.id ? { ...candidate, cues } : candidate)),
        };
        if (contextText !== undefined) changes.contextText = contextText;
        if (glossaryEntries !== undefined) changes.glossary = toPlainGlossary(glossaryEntries);
        updateHistoryJob(job.id, changes).then((updated) => {
          if (updated) job.updatedAt = updated.updatedAt;
        }).catch(() => {});
        return {
          lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(Date.now()) }),
          rawSrt: renderTarget(job, subtitle),
        };
      },
    }
  );
}
