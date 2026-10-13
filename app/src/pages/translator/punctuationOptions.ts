import { isChineseLanguage } from "../../lib/subtitle/common/languageCodes";
import type { WorkspaceState } from "./state";

export interface PunctuationPayload {
  fullWidthPunctuation?: boolean;
  keepTerminalPunctuation?: boolean;
}

export function punctuationPayload(state: WorkspaceState, targetLang: string): PunctuationPayload {
  return isChineseLanguage(targetLang)
    ? { fullWidthPunctuation: state.fullWidthPunctuation, keepTerminalPunctuation: state.keepTerminalPunctuation }
    : {};
}
