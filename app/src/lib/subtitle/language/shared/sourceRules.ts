import { SourceRules } from "./types";

export function createSourceRules(overrides: Partial<SourceRules> = {}): SourceRules {
  return { sdh: null, bilingualWithChineseByDefault: false, ...overrides };
}
