import { scriptOf } from "../subtitle/common/languageCodes";

export function hasConsistencyRisk(source: string, target: string): boolean {
  const from = scriptOf(source);
  const to = scriptOf(target);
  return from !== undefined && to !== undefined && from !== to;
}
