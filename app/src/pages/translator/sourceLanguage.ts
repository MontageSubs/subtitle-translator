import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import type { SubtitleFile, WorkspaceState } from "./state";

export function requestedSourceLang(state: WorkspaceState, file: SubtitleFile): string {
  if (state.sourceMode === "forced") return state.sourceLang;
  if (state.sourceMode === "cloud") return AUTO_DETECT_CODE;
  return file.detectedLang ?? AUTO_DETECT_CODE;
}

export function detectedLanguages(files: readonly SubtitleFile[]): string[] {
  const counts = new Map<string, number>();
  for (const { detectedLang } of files) if (detectedLang) counts.set(detectedLang, (counts.get(detectedLang) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([code]) => code);
}
