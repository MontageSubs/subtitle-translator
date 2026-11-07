import type { TranslationResult } from "../../api/translation";
import { hasReusableTranslation } from "./translationSignature";
import type { SubtitleFile, WorkspaceState } from "./state";

export const unfinishedCueCount = (file: SubtitleFile): number =>
  file.jobResult ? file.jobResult.missing_cues.length : file.cues.length;

export const totalUnfinishedCues = (files: readonly SubtitleFile[]): number =>
  files.reduce((sum, file) => sum + unfinishedCueCount(file), 0);

export const isSettledForRun = (state: WorkspaceState, file: SubtitleFile, resume: boolean): boolean =>
  hasReusableTranslation(state, file) && (!resume || unfinishedCueCount(file) === 0);

export const resumableResult = (state: WorkspaceState, file: SubtitleFile): TranslationResult | null =>
  hasReusableTranslation(state, file) && unfinishedCueCount(file) > 0 ? file.jobResult : null;
