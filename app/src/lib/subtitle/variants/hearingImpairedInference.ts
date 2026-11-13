import { baseLanguage } from "../common/languageCodes";
import type { SubtitleVariant } from "./types";

const ANNOTATION = /\[[^\]\n]{2,60}\]|♪/g;
const MIN_ANNOTATION_RATIO = 0.06;
const MIN_RATIO_CONTRAST = 2.5;
const RATIO_MARGIN = 0.02;
const decoder = new TextDecoder();

function annotationRatio(variant: SubtitleVariant): number {
  return variant.cueCount ? (decoder.decode(variant.bytes).match(ANNOTATION)?.length ?? 0) / variant.cueCount : 0;
}

export function inferHearingImpaired(variants: SubtitleVariant[]): SubtitleVariant[] {
  const candidates = variants.filter((variant) => variant.origin === "track" && variant.language && !variant.isForced && !variant.isHearingImpaired);
  const byLanguage = new Map<string, SubtitleVariant[]>();
  for (const variant of candidates) byLanguage.set(baseLanguage(variant.language), [...(byLanguage.get(baseLanguage(variant.language)) ?? []), variant]);
  const inferred = new Set<SubtitleVariant>();
  for (const siblings of byLanguage.values()) {
    if (siblings.length < 2) continue;
    const ratios = new Map(siblings.map((variant) => [variant, annotationRatio(variant)]));
    const lowest = Math.min(...ratios.values());
    for (const [variant, ratio] of ratios) if (ratio >= MIN_ANNOTATION_RATIO && ratio >= lowest * MIN_RATIO_CONTRAST + RATIO_MARGIN) inferred.add(variant);
  }
  return variants.map((variant) => (inferred.has(variant) ? { ...variant, isHearingImpaired: true } : variant));
}
