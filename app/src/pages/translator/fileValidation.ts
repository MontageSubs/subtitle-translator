import { t, type TranslationKey } from "../../i18n";
import { MAX_SUBTITLES_PER_JOB } from "../../lib/history/historyQuota";
import type { InputRejectionReason, RejectedInput } from "../../lib/subtitle/archive";
import { requestedSourceLang } from "./sourceLanguage";
import type { SubtitleFile, WorkspaceState } from "./state";

export function fileProblem(file: SubtitleFile): string | null {
  if (!file.parseError && file.cues.length > 0) return null;
  switch (file.parseErrorReason ?? (file.parseError ? null : "noCues")) {
    case "invalidFormat": return t("error.invalidSubtitleFormat", { name: file.filename });
    case "noCues": return t("error.noDialogueLines", { name: file.filename });
    default: return t("error.unreadableFile", { name: file.filename });
  }
}

const ARCHIVE_PROBLEM_KEYS = {
  unsupported: "error.unsupportedArchive",
  empty: "error.emptyArchive",
  unreadable: "error.unreadableArchive",
  videoUnreadable: "error.unreadableVideo",
  noSupportedSubtitle: "error.noSupportedSubtitle",
} as const satisfies Record<InputRejectionReason, TranslationKey>;

export function inputProblem({ name, reason }: RejectedInput): string {
  return t(ARCHIVE_PROBLEM_KEYS[reason], { name });
}

export function hasUsableFiles(state: WorkspaceState): boolean {
  return state.files.some((file) => fileProblem(file) === null);
}

export function hasQueuedInput(state: WorkspaceState): boolean {
  return state.files.length > 0 || state.rejectedInputs.length > 0;
}

export const hasSameLanguageConflict = (state: WorkspaceState): boolean =>
  state.files.some((file) => requestedSourceLang(state, file) === state.targetLang);

export function submissionBlocker(state: WorkspaceState): string | null {
  if (state.intakeActive) return t("start.blocked.reading");
  for (const file of state.files) {
    const problem = fileProblem(file);
    if (problem) return problem;
  }
  if (hasSameLanguageConflict(state)) return t("start.blocked.sameLanguage");
  if (state.files.length > MAX_SUBTITLES_PER_JOB) return t("error.tooManySubtitles", { max: MAX_SUBTITLES_PER_JOB });
  return state.rejectedInputs.length ? inputProblem(state.rejectedInputs[0]) : null;
}
