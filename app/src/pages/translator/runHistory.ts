import { saveHistoryJob, updateHistoryJob } from "../../lib/history/history";
import { toStoredGlossary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { buildHistorySubtitles } from "./historyBridge";
import { fileCountLabel } from "./state";
import type { RunOutcome } from "./translationBatch";
import type { WorkspaceContext } from "./context";

export async function recordHistory(ctx: WorkspaceContext, outcome: RunOutcome): Promise<void> {
  const { state } = ctx;
  const subtitles = buildHistorySubtitles(state);
  const [first] = subtitles;
  const incomplete = subtitles.some((subtitle) => subtitle.incomplete) || undefined;
  const fields = {
    provider: outcome.actualProvider,
    sourceLang: subtitles.find((subtitle) => subtitle.sourceLang)?.sourceLang ?? AUTO_DETECT_CODE,
    targetLang: state.targetLang,
    subtitles,
    glossary: toStoredGlossary(state.glossaryEntries),
    contextText: state.contextText,
    caseSensitiveTerms: state.caseSensitiveTerms,
    incomplete,
    stripSdh: state.sdhEnabled,
    skipLyrics: state.skipLyrics,
    fullWidthPunctuation: state.fullWidthPunctuation,
    keepTerminalPunctuation: state.keepTerminalPunctuation,
    sceneSeconds: state.sceneSeconds,
    elapsedMs: state.elapsedMs ?? undefined,
  };
  const resumedId = state.historyIncomplete ? state.currentHistoryId : null;
  const resumed = resumedId ? await updateHistoryJob(resumedId, fields).catch(() => undefined) : undefined;
  state.currentHistoryId = resumed !== undefined
    ? resumedId
    : await saveHistoryJob({ ...fields, engine: "nmt", title: subtitles.length === 1 ? first.filename : fileCountLabel(subtitles.length) }).catch(() => null);
  state.historyIncomplete = incomplete === true;
}
