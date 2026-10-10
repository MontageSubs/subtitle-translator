import { collapseAdjacentStyleWraps } from "../common/markup";

export const joinCueLines = (text: string): string => collapseAdjacentStyleWraps(text.replace(/\n/g, " ")).replace(/\s+/g, " ").trim();
