import { baseLanguage } from "../common/languageCodes";
import type { SubtitleVariant, VariantGroup } from "./types";

export const WHOLE_FILE_KEY = "__whole__";
export const UNKNOWN_LANGUAGE_KEY = "__unknown__";

export interface LanguageRow {
  key: string;
  language: string | null;
  entries: { group: VariantGroup; variant: SubtitleVariant }[];
}

export const rowKeyOf = (variant: SubtitleVariant): string => (variant.origin === "whole" ? WHOLE_FILE_KEY : variant.language ?? UNKNOWN_LANGUAGE_KEY);

export const rowKeysOf = (group: VariantGroup): string[] => [...new Set(group.variants.map(rowKeyOf))];

export const needsChoice = (group: VariantGroup): boolean => rowKeysOf(group).length > 1;

const flagPenalty = (variant: SubtitleVariant): number => (variant.isForced ? 2 : 0) + (variant.isHearingImpaired ? 1 : 0);

function compareVariants(a: SubtitleVariant, b: SubtitleVariant): number {
  return flagPenalty(a) - flagPenalty(b) || Number(b.isDefault) - Number(a.isDefault) || b.cueCount - a.cueCount;
}

export function bestVariantFor(group: VariantGroup, key: string): SubtitleVariant | undefined {
  return group.variants.filter((variant) => rowKeyOf(variant) === key).sort(compareVariants)[0];
}

function priorityOf(key: string, order: readonly string[]): number {
  if (key === WHOLE_FILE_KEY) return Number.MAX_SAFE_INTEGER;
  if (key === UNKNOWN_LANGUAGE_KEY) return Number.MAX_SAFE_INTEGER - 1;
  const exact = order.indexOf(key);
  if (exact >= 0) return exact;
  const sibling = order.findIndex((code) => baseLanguage(code) === baseLanguage(key));
  return sibling >= 0 ? sibling + 0.5 : order.length;
}

export function sortKeys(keys: readonly string[], order: readonly string[]): string[] {
  return [...keys].sort((a, b) => priorityOf(a, order) - priorityOf(b, order));
}

export function buildLanguageRows(groups: readonly VariantGroup[], order: readonly string[]): LanguageRow[] {
  const rows = new Map<string, LanguageRow>();
  for (const group of groups) {
    for (const key of rowKeysOf(group)) {
      const variant = bestVariantFor(group, key)!;
      const row = rows.get(key) ?? { key, language: variant.origin === "whole" ? null : variant.language, entries: [] };
      row.entries.push({ group, variant });
      rows.set(key, row);
    }
  }
  return sortKeys([...rows.keys()], order).map((key) => rows.get(key)!);
}

export function defaultKeyOf(group: VariantGroup, order: readonly string[]): string {
  return sortKeys(rowKeysOf(group), order)[0];
}

export function defaultRowKey(rows: readonly LanguageRow[]): string {
  return rows[0].key;
}

export function resolveKey(group: VariantGroup, preferredKey: string | undefined, order: readonly string[]): SubtitleVariant {
  const key = preferredKey !== undefined && rowKeysOf(group).includes(preferredKey) ? preferredKey : defaultKeyOf(group, order);
  return bestVariantFor(group, key)!;
}
