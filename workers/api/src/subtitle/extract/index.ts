import type { ProtocolCue } from "../../http/protocol";
import type { ExtractResult, Glossary } from "../types";
import { DEFAULT_SCENE_CHANGE_SECONDS } from "../common/sceneThreads";
import { sourceRulesFor } from "../languages/registry";
import { prepareCues } from "./cues";
import { compileGlossary } from "./glossary";
import { buildSegments } from "./segments";
import { groupSegments } from "./grouping";
import { buildUnits } from "./units";

export interface ExtractOptions {
  sourceLang?: string;
  isolatedMergeMaxWords?: number;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
}

export function extract(protocolCues: ProtocolCue[], glossary: Glossary, options: ExtractOptions = {}): ExtractResult {
  const cues = prepareCues(protocolCues);
  if (!cues.length) return { success: false, cues: [], units: [], chapters: [], marker_merges: 0 };

  const rules = sourceRulesFor(options.sourceLang || "en");
  const compiled = compileGlossary(glossary, options.caseSensitiveTerms ?? false);
  const segments = buildSegments(cues, compiled, rules, options.isolatedMergeMaxWords ?? 0);
  const sceneChangeMs = (options.sceneChangeSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS) * 1000;
  const { units, chapters, markerMerges } = buildUnits(groupSegments(segments, rules), compiled, sceneChangeMs);
  return { success: true, cues, units, chapters, marker_merges: markerMerges };
}
