import { SdhRules } from "../shared/types";

export function defineSdhRules(overrides: Partial<SdhRules> = {}): SdhRules {
  return { stripsSpeakerTags: false, stripsLabelColon: false, marksLabelTurns: false, ...overrides };
}
