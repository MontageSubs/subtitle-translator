import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import type { SubtitleFile, WorkspaceState } from "./state";

export interface TranslationRequest {
  sourceLang: string;
  targetLang: string;
  glossary: Record<string, string>;
  contextText: string | undefined;
}

function effectiveSourceLang(file: SubtitleFile, requested: string): string {
  return requested === AUTO_DETECT_CODE ? file.jobResult?.resolved_source_lang || requested : requested;
}

export function translationSignature(state: WorkspaceState, file: SubtitleFile, request: TranslationRequest): string {
  return JSON.stringify([
    file.id,
    file.cues.length,
    state.provider,
    effectiveSourceLang(file, request.sourceLang),
    request.targetLang,
    state.sdhEnabled,
    state.sceneSeconds,
    state.caseSensitiveTerms,
    Object.entries(request.glossary).sort(),
    request.contextText ?? "",
  ]);
}

export function hasReusableTranslation(state: WorkspaceState, file: SubtitleFile, request: TranslationRequest): boolean {
  return file.jobResult !== null && file.translationSignature === translationSignature(state, file, request);
}

export function discardTranslations(state: WorkspaceState): void {
  state.files.forEach((file) => { file.translationSignature = null; });
}
