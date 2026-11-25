import { isHistoryStorageAvailable, saveHistoryJob, updateHistoryJob } from "../../lib/history/history";
import { showToast, TOAST_PRIORITY } from "../../components/toast";
import { t } from "../../i18n";
import { markAwaitingDownload } from "../../lib/history/downloadPending";
import { createId } from "../../utils/id";
import { toStoredGlossary } from "../../utils/glossary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { jobAssist } from "./assistScope";
import { buildHistorySubtitles } from "./historyBridge";
import { fileCountLabel } from "./state";
import type { RunOutcome } from "./translationBatch";
import type { WorkspaceContext } from "./context";

const STORAGE_UNAVAILABLE_TOAST_MS = 5000;

export async function recordHistory(ctx: WorkspaceContext, outcome: RunOutcome): Promise<void> {
  const { state } = ctx;
  const subtitles = buildHistorySubtitles(state);
  const assist = jobAssist(state);
  const [first] = subtitles;
  const incomplete = subtitles.some((subtitle) => subtitle.incomplete) || undefined;
  const fields = {
    provider: outcome.actualProvider,
    sourceLang: subtitles.find((subtitle) => subtitle.sourceLang)?.sourceLang ?? AUTO_DETECT_CODE,
    targetLang: state.targetLang,
    subtitles,
    glossary: toStoredGlossary(assist.glossaryEntries),
    contextText: assist.contextText,
    caseSensitiveTerms: state.caseSensitiveTerms,
    incomplete,
    stripSdh: state.sdhEnabled,
    skipLyrics: state.skipLyrics,
    fullWidthPunctuation: state.fullWidthPunctuation,
    keepTerminalPunctuation: state.keepTerminalPunctuation,
    stripInlineStyling: state.stripInlineStyling,
    sceneSeconds: state.sceneSeconds,
    elapsedMs: state.elapsedMs ?? undefined,
  };
  const resumedId = state.historyIncomplete || outcome.resumed ? state.currentHistoryId : null;
  const jobId = resumedId ?? createId();
  if (subtitles.some((subtitle) => !subtitle.incomplete)) markAwaitingDownload(jobId);
  const resumed = resumedId ? await updateHistoryJob(resumedId, fields).catch(() => undefined) : undefined;
  state.currentHistoryId = resumed !== undefined
    ? resumedId
    : await saveHistoryJob({ ...fields, id: jobId, engine: "nmt", title: subtitles.length === 1 ? first.filename : fileCountLabel(subtitles.length) }).catch(() => null);
  state.historyIncomplete = incomplete === true;
  if (state.currentHistoryId === null && !(await isHistoryStorageAvailable())) {
    showToast({
      key: "history-storage-unavailable",
      message: t("history.saveFailed", { reason: t("storage.unavailable.reason") }),
      priority: TOAST_PRIORITY.warning,
      durationMs: STORAGE_UNAVAILABLE_TOAST_MS,
    });
  }
}
