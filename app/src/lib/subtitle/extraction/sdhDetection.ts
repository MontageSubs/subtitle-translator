import type { Cue } from "../types";
import { applySdhStripping, hasSdhRules } from "./sdh";

export function sdhShare(cues: Cue[], language: string | null): number | null {
  if (!language || !cues.length || !hasSdhRules(language)) return null;
  const { stats } = applySdhStripping(cues, language, true);
  return (stats.dropped + stats.stripped) / cues.length;
}
