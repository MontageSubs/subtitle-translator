import type { Chapter, Cue, Unit } from "../../subtitle/types";

export interface EngineInput {
  cues: Cue[];
  units: Unit[];
  chapters: Chapter[];
}

export type UnitTranslations = Map<number, string>;
