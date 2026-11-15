import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { closestLanguage } from "../../utils/providerLanguages";
import type { SubtitleFile, WorkspaceState } from "./state";

const baseOf = (tag: string): string => tag.split("-")[0].toLowerCase();

export function requestedSourceLang(state: WorkspaceState, file: SubtitleFile): string {
  if (state.sourceMode === "forced") return state.sourceLang;
  if (state.sourceMode === "cloud" || !file.detectedLang) return AUTO_DETECT_CODE;
  return closestLanguage(state.provider, file.detectedLang, "source")?.tag ?? file.detectedLang;
}

export function isSourceUnsupported(state: WorkspaceState, file: SubtitleFile): boolean {
  return state.sourceMode === "local" && Boolean(file.detectedLang) && !closestLanguage(state.provider, file.detectedLang!, "source");
}

export function unsupportedSourceLanguages(state: WorkspaceState): string[] {
  return [...new Set(state.files.filter((file) => isSourceUnsupported(state, file)).map((file) => file.detectedLang!))];
}

export function enrichDetection(detected: string | null, containerHint: string | undefined): string | null {
  if (!containerHint) return detected;
  if (!detected) return containerHint;
  return baseOf(containerHint) === baseOf(detected) ? containerHint : detected;
}

export function detectedLanguages(files: readonly SubtitleFile[]): string[] {
  const counts = new Map<string, number>();
  for (const { detectedLang } of files) if (detectedLang) counts.set(detectedLang, (counts.get(detectedLang) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([code]) => code);
}
