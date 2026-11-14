import { baseLanguage } from "../common/languageCodes";
import type { SubtitleVariant, VariantGroup } from "./types";

export const UNKNOWN_LANGUAGE_KEY = "?";

export interface KeyedVariant {
  key: string;
  variant: SubtitleVariant;
}

export interface LanguageRow {
  key: string;
  language: string | null;
  isForced: boolean;
  isHearingImpaired: boolean;
  entries: { group: VariantGroup; variant: SubtitleVariant }[];
}

interface KeyParts {
  language: string | null;
  isForced: boolean;
  isHearingImpaired: boolean;
  ordinal: number;
}

const keyedCache = new WeakMap<VariantGroup, KeyedVariant[]>();

const kindOf = (variant: SubtitleVariant): string => `${variant.isForced ? "f" : ""}${variant.isHearingImpaired ? "h" : ""}`;

const flagPenalty = (variant: SubtitleVariant): number => (variant.isForced ? 2 : 0) + (variant.isHearingImpaired ? 1 : 0);

function compareVariants(a: SubtitleVariant, b: SubtitleVariant): number {
  return flagPenalty(a) - flagPenalty(b) || Number(b.isDefault) - Number(a.isDefault) || b.cueCount - a.cueCount;
}

export function keyedVariants(group: VariantGroup): KeyedVariant[] {
  const cached = keyedCache.get(group);
  if (cached) return cached;
  const seen = new Map<string, number>();
  const keyed = [...group.variants].sort(compareVariants).map((variant): KeyedVariant => {
    const base = `${variant.language ?? UNKNOWN_LANGUAGE_KEY}|${kindOf(variant)}`;
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    return { key: `${base}|${ordinal}`, variant };
  });
  keyedCache.set(group, keyed);
  return keyed;
}

export function keyParts(key: string): KeyParts {
  const [language, kind, ordinal] = key.split("|");
  return { language: language === UNKNOWN_LANGUAGE_KEY ? null : language, isForced: kind.includes("f"), isHearingImpaired: kind.includes("h"), ordinal: Number(ordinal) };
}

export const needsChoice = (group: VariantGroup): boolean => group.variants.length > 1;

export const keysOf = (group: VariantGroup): string[] => keyedVariants(group).map(({ key }) => key);

export const variantForKey = (group: VariantGroup, key: string): SubtitleVariant | undefined => keyedVariants(group).find((entry) => entry.key === key)?.variant;

export const keyOfVariant = (group: VariantGroup, variant: SubtitleVariant): string => keyedVariants(group).find((entry) => entry.variant === variant)!.key;

const withOriginals = (originals: readonly string[], order: readonly string[]): string[] => [...new Set([...originals, ...order])];

function sharedOriginals(groups: readonly VariantGroup[]): string[] {
  const votes = new Map<string, number>();
  for (const group of groups) for (const language of group.originalLanguages) votes.set(language, (votes.get(language) ?? 0) + 1);
  return [...votes].sort((a, b) => b[1] - a[1]).map(([language]) => language);
}

function languagePriority(language: string | null, order: readonly string[]): number {
  if (!language) return Number.MAX_SAFE_INTEGER;
  const exact = order.indexOf(language);
  if (exact >= 0) return exact;
  const sibling = order.findIndex((code) => baseLanguage(code) === baseLanguage(language));
  return sibling >= 0 ? sibling + 0.5 : order.length;
}

function compareKeys(a: string, b: string, order: readonly string[]): number {
  const left = keyParts(a);
  const right = keyParts(b);
  return languagePriority(left.language, order) - languagePriority(right.language, order)
    || (Number(left.isForced) * 2 + Number(left.isHearingImpaired)) - (Number(right.isForced) * 2 + Number(right.isHearingImpaired))
    || left.ordinal - right.ordinal;
}

export const sortKeys = (keys: readonly string[], order: readonly string[]): string[] => [...keys].sort((a, b) => compareKeys(a, b, order));

const isAvoided = (key: string, avoidLanguage: string | undefined): boolean => {
  const { language } = keyParts(key);
  return avoidLanguage !== undefined && language !== null && baseLanguage(language) === baseLanguage(avoidLanguage);
};

function firstPreferred(keys: readonly string[], avoidLanguage: string | undefined): string {
  return keys.find((key) => !isAvoided(key, avoidLanguage)) ?? keys[0];
}

export function buildLanguageRows(groups: readonly VariantGroup[], order: readonly string[]): LanguageRow[] {
  const rows = new Map<string, LanguageRow>();
  for (const group of groups) {
    for (const { key, variant } of keyedVariants(group)) {
      const row = rows.get(key) ?? { key, language: variant.language, isForced: variant.isForced, isHearingImpaired: variant.isHearingImpaired, entries: [] };
      row.entries.push({ group, variant });
      rows.set(key, row);
    }
  }
  const ranking = withOriginals(sharedOriginals(groups), order);
  return [...rows.values()].sort((a, b) => b.entries.length - a.entries.length || compareKeys(a.key, b.key, ranking));
}

export function defaultKeyOf(group: VariantGroup, order: readonly string[], avoidLanguage?: string): string {
  return firstPreferred(sortKeys(keysOf(group), withOriginals(group.originalLanguages, order)), avoidLanguage);
}

export function defaultRowKey(rows: readonly LanguageRow[], avoidLanguage: string | undefined): string {
  return firstPreferred(rows.map(({ key }) => key), avoidLanguage);
}

export function resolveKey(group: VariantGroup, preferredKey: string | undefined, order: readonly string[], avoidLanguage?: string): SubtitleVariant {
  const key = preferredKey !== undefined && keysOf(group).includes(preferredKey) ? preferredKey : defaultKeyOf(group, order, avoidLanguage);
  return variantForKey(group, key)!;
}
