import { t, type TranslationKey } from "../../i18n";
import type { ArchiveRejectionReason, RejectedArchive } from "../../lib/subtitle/archive";
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
} as const satisfies Record<ArchiveRejectionReason, TranslationKey>;

export function archiveProblem({ name, reason }: RejectedArchive): string {
  return t(ARCHIVE_PROBLEM_KEYS[reason], { name });
}

export function hasUsableFiles(state: WorkspaceState): boolean {
  return state.files.some((file) => fileProblem(file) === null);
}

export function hasQueuedInput(state: WorkspaceState): boolean {
  return state.files.length > 0 || state.rejectedArchives.length > 0;
}

export function submissionBlocker(state: WorkspaceState): string | null {
  for (const file of state.files) {
    const problem = fileProblem(file);
    if (problem) return problem;
  }
  return state.rejectedArchives.length ? archiveProblem(state.rejectedArchives[0]) : null;
}
