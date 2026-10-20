import { getLocale, t } from "../../i18n";
import { HistoryCue, HistoryJob, HistorySubtitle, getHistoryJob, updateHistoryJob } from "../../lib/history/history";
import { historyCuesToCues, historyCuesToTopAlignOverrides, renderHistorySubtitle } from "../../lib/history/historyRender";
import { formatSubtitleTime } from "../../lib/subtitle/formats/formatTime";
import { AnCornerOrDefault } from "../../lib/subtitle/formats/topAlign";
import { effectiveCueLayout, LayoutInfo, positionRule, resolveCuePlacement } from "../../lib/subtitle/formats/cueLayout";
import { prepareTranslation } from "../../lib/subtitle/postprocess/lineWrap";
import { resolveDisplayOriginal } from "../../lib/subtitle/postprocess/displayText";
import { openPreviewModal, PreviewCard, withCreditCard } from "../../components/preview";
import { DEFAULT_CREDIT_ENABLED } from "../../lib/subtitle/formats/credit";
import { restoreSourceFile } from "../../lib/history/sourceLayout";
import { glossaryToEntries, toStoredGlossary } from "../../utils/dictionary";
import { formatDateTime } from "../../utils/localeFormat";

function layoutOf(subtitle: HistorySubtitle): LayoutInfo {
  return { cueLayout: effectiveCueLayout(subtitle.format, subtitle.cueLayout), mode: subtitle.outputMode, stacking: subtitle.stacking };
}

function toPreviewCards(subtitle: HistorySubtitle, sourceLang: string, targetLang: string): PreviewCard[] {
  const originalById = new Map(historyCuesToCues(subtitle.cues).map((cue) => [cue.id, cue]));
  const overrides = historyCuesToTopAlignOverrides(subtitle.cues);
  const musicTopAlign = Boolean(subtitle.musicTopAlign);
  const layout = layoutOf(subtitle);
  const cards: PreviewCard[] = subtitle.cues.map((cue) => {
    const topAlign = resolveCuePlacement(layout, originalById.get(cue.id), cue.is_music, musicTopAlign, overrides.get(cue.id));
    const target = prepareTranslation(cue.translatedText, subtitle.outputMode, layout.cueLayout, targetLang, cue.end_ms - cue.start_ms);
    const source = resolveDisplayOriginal(cue.sourceText, cue.sourceText, true);
    return {
      id: cue.id,
      start: formatSubtitleTime(cue.start_ms, subtitle.format),
      end: formatSubtitleTime(cue.end_ms, subtitle.format),
      source,
      target: cue.verbatim ? source : target,
      locked: cue.verbatim,
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      sourceLang,
      targetLang,
      topAlignAn: topAlign?.an ?? 2,
    };
  });
  return withCreditCard(cards, {
    enabled: subtitle.credit ?? DEFAULT_CREDIT_ENABLED,
    cues: subtitle.cues,
    originalById,
    format: subtitle.format,
    sourceLang,
    targetLang,
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
  const source = restoreSourceFile(subtitle);

  openPreviewModal(
    renderTarget(job, subtitle),
    renderHistorySubtitle(subtitle, true, job.sourceLang, job.targetLang, Boolean(job.stripSdh)),
    toPreviewCards(subtitle, job.sourceLang, job.targetLang),
    {
      lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(job.updatedAt, getLocale()) }),
      initialContext: job.contextText,
      initialGlossary: job.glossary ? glossaryToEntries(job.glossary) : undefined,
      sceneSeconds: job.sceneSeconds,
      sourceFilename: subtitle.sourceFilename || subtitle.filename,
      translatedFilename: subtitle.filename,
      sourceLang: job.sourceLang,
      targetLang: job.targetLang,
      trueOriginalSourceText: source?.text,
      trueOriginalSourceBytes: source?.bytes,
      outputMode: subtitle.outputMode,
      cueLayout: layoutOf(subtitle).cueLayout,
      positionRule: positionRule(layoutOf(subtitle)),
      onApply: ({ edits, contextText, glossaryEntries, positionEdits }) => {
        const cues = applyEdits(subtitle, edits, positionEdits);
        subtitle.cues = cues;
        const changes: Partial<HistoryJob> = {
          subtitles: job.subtitles.map((candidate) => (candidate.id === subtitle.id ? { ...candidate, cues } : candidate)),
        };
        if (contextText !== undefined) changes.contextText = contextText;
        if (glossaryEntries !== undefined) changes.glossary = toStoredGlossary(glossaryEntries);
        updateHistoryJob(job.id, changes).then((updatedAt) => {
          if (updatedAt) job.updatedAt = updatedAt;
        }).catch(() => {});
        return {
          lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(Date.now(), getLocale()) }),
          rawSrt: renderTarget(job, subtitle),
        };
      },
    }
  );
}
