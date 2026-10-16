import { t } from "../../i18n";
import type { SubtitleFile, WorkspaceState } from "./state";

export function fileProblem(file: SubtitleFile): string | null {
  if (!file.parseError && file.cues.length > 0) return null;
  switch (file.parseErrorReason ?? (file.parseError ? null : "noCues")) {
    case "invalidFormat": return t("error.invalidSubtitleFormat", { name: file.filename });
    case "noCues": return t("error.noDialogueLines", { name: file.filename });
    default: return t("error.unreadableFile", { name: file.filename });
  }
}

export function archiveProblem(name: string): string {
  return t("error.unsupportedArchive", { name });
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
