import { t } from "../../../i18n";
import { evaluateReadingSpeed } from "../../../lib/subtitle/common/lineMetrics";
import { readingProfileFor } from "../../../lib/subtitle/common/readingProfiles";
import { isLeakedUntranslated } from "../../../lib/subtitle/common/untranslated";
import { CardErrorInfo, ErrorCategoryKey, PreviewCard } from "../types";
import { cardDurationMs } from "./cardTiming";

export type ActiveCategories = ReadonlySet<ErrorCategoryKey>;

export const NO_ERROR: CardErrorInfo = { missing: false, overLength: false, overCps: false, leaked: false, cps: 0 };

export function evaluateCardError(card: PreviewCard, targetText: string): CardErrorInfo {
  if (!targetText.trim()) return { ...NO_ERROR, missing: true };
  const metrics = evaluateReadingSpeed(targetText, cardDurationMs(card), readingProfileFor(card.targetLang));
  const leaked = (Boolean(card.leaked) && targetText === card.target)
    || isLeakedUntranslated(card.source, targetText, card.sourceLang, card.targetLang);
  return { missing: false, overLength: metrics.overLength, overCps: metrics.overCps, leaked, cps: metrics.cps };
}

export function countCategories(errors: Iterable<CardErrorInfo>): Record<ErrorCategoryKey, number> {
  const counts: Record<ErrorCategoryKey, number> = { missing: 0, overLength: 0, overCps: 0, leaked: 0 };
  for (const error of errors) {
    (Object.keys(counts) as ErrorCategoryKey[]).forEach((key) => { if (error[key]) counts[key] += 1; });
  }
  return counts;
}

export function isCategoryActive(error: CardErrorInfo, active: ActiveCategories): boolean {
  return (error.missing && active.has("missing")) || (error.overLength && active.has("overLength"))
    || (error.overCps && active.has("overCps")) || (error.leaked && active.has("leaked"));
}

export function isSevere(error: CardErrorInfo, active: ActiveCategories): boolean {
  return (error.missing && active.has("missing")) || (error.leaked && active.has("leaked"));
}

export function isSoftWarning(error: CardErrorInfo, active: ActiveCategories, softMode: boolean): boolean {
  if (!softMode || !isCategoryActive(error, active) || isSevere(error, active)) return false;
  if (error.overCps && active.has("overCps")) return false;
  return error.overLength && active.has("overLength");
}

export function cardStateClass(error: CardErrorInfo, active: ActiveCategories, soft = false): string {
  if (!isCategoryActive(error, active)) return "";
  if (error.missing && active.has("missing")) return " preview-card--missing";
  if (error.leaked && active.has("leaked")) return " preview-card--leaked";
  return soft ? " preview-card--soft-warning" : " preview-card--warning";
}

export function describeReasons(error: CardErrorInfo, active: ActiveCategories): string {
  if (!isCategoryActive(error, active)) return "";
  const reasons: string[] = [];
  if (error.missing && active.has("missing")) reasons.push(t("preview.warning.missing"));
  if (error.leaked && active.has("leaked")) reasons.push(t("preview.warning.leaked"));
  if (error.overLength && active.has("overLength")) reasons.push(t("preview.warning.overLength"));
  if (error.overCps && active.has("overCps")) reasons.push(t("preview.warning.overCps", { cps: error.cps.toFixed(1) }));
  return reasons.join(" · ");
}
