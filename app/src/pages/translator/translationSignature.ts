import { supportsContext } from "../../components/contextInput";
import { entriesToGlossary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { requestedSourceLang } from "./sourceLanguage";
import type { SubtitleFile, WorkspaceState } from "./state";

function effectiveSourceLang(state: WorkspaceState, file: SubtitleFile): string {
  const requested = requestedSourceLang(state, file);
  return requested === AUTO_DETECT_CODE ? file.jobResult?.resolved_source_lang || requested : requested;
}

export function translationSignature(state: WorkspaceState, file: SubtitleFile): string {
  return JSON.stringify([
    file.id,
    file.cues.length,
    state.provider,
    effectiveSourceLang(state, file),
    state.targetLang,
    state.sdhEnabled,
    state.sceneSeconds,
    state.caseSensitiveTerms,
    state.skipLyrics,
    Object.entries(entriesToGlossary(state.glossaryEntries)).sort(),
    supportsContext(state.provider) ? state.contextText.trim() : "",
  ]);
}

export function hasReusableTranslation(state: WorkspaceState, file: SubtitleFile): boolean {
  return file.jobResult !== null && file.translationSignature === translationSignature(state, file);
}

export function discardTranslations(state: WorkspaceState): void {
  state.files.forEach((file) => { file.translationSignature = null; });
}
