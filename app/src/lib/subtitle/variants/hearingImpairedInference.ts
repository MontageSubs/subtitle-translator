import { baseLanguage } from "../common/languageCodes";
import { sdhShare } from "../extraction/sdhDetection";
import { parseSubtitle } from "../formats/registry";
import type { SubtitleVariant } from "./types";

const MIN_SDH_SHARE = 0.06;
const MIN_SHARE_CONTRAST = 2.5;
const SHARE_MARGIN = 0.02;
const decoder = new TextDecoder();

const shareOf = (variant: SubtitleVariant): number | null => sdhShare(parseSubtitle(variant.format, decoder.decode(variant.bytes)), variant.language);

export function inferHearingImpaired(variants: SubtitleVariant[]): SubtitleVariant[] {
  const byLanguage = new Map<string, SubtitleVariant[]>();
  for (const variant of variants) {
    if (variant.origin !== "track" || !variant.language || variant.isForced) continue;
    const base = baseLanguage(variant.language);
    byLanguage.set(base, [...(byLanguage.get(base) ?? []), variant]);
  }
  const inferred = new Set<SubtitleVariant>();
  for (const siblings of byLanguage.values()) {
    if (siblings.length < 2 || siblings.some((variant) => variant.isHearingImpaired)) continue;
    const shares = new Map(siblings.map((variant) => [variant, shareOf(variant)]));
    const measured = [...shares.values()].filter((share): share is number => share !== null);
    if (measured.length < siblings.length) continue;
    const lowest = Math.min(...measured);
    for (const [variant, share] of shares) if (share! >= MIN_SDH_SHARE && share! >= lowest * MIN_SHARE_CONTRAST + SHARE_MARGIN) inferred.add(variant);
  }
  return variants.map((variant) => (inferred.has(variant) ? { ...variant, isHearingImpaired: true } : variant));
}
