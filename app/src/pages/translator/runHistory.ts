import { saveHistoryJob } from "../../lib/history/history";
import { toStoredGlossary } from "../../utils/dictionary";
import { buildHistorySubtitles } from "./historyBridge";
import { fileCountLabel } from "./state";
import type { RunOutcome } from "./translationBatch";
import type { WorkspaceContext } from "./context";

export function recordHistory(ctx: WorkspaceContext, outcome: RunOutcome): void {
  const { state } = ctx;
  const subtitles = buildHistorySubtitles(state);
  const [first] = subtitles;
  saveHistoryJob({
    engine: "nmt",
    provider: outcome.actualProvider,
    title: subtitles.length === 1 ? first.filename : fileCountLabel(subtitles.length),
    sourceLang: outcome.resolvedSourceLang,
    targetLang: ctx.language.targetCode(),
    subtitles,
    glossary: toStoredGlossary(state.glossaryEntries),
    contextText: state.contextText,
    caseSensitiveTerms: state.caseSensitiveTerms,
    stripSdh: state.sdhEnabled,
    skipLyrics: state.skipLyrics,
    fullWidthPunctuation: state.fullWidthPunctuation,
    keepTerminalPunctuation: state.keepTerminalPunctuation,
    sceneSeconds: state.sceneSeconds,
    elapsedMs: state.elapsedMs ?? undefined,
  }).then((id) => {
    state.currentHistoryId = id;
    ctx.stats.refreshLocalCount();
    void ctx.historyGate.sync();
  }).catch(() => {});
}
