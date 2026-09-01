import { t } from '../../i18n';
import { evaluateLineMetrics } from "./lineMetrics";
import { PreviewCard, CardErrorInfo, ErrorCategoryKey, TimeSearchResult } from '../../types/preview';

function parseTimeToMs(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length < 2) return 1000;
  const [ss, ms = "0"] = parts.pop()!.split(/[,.]/);
  const mm = parts.pop() ?? "0";
  const hh = parts.pop() ?? "0";
  return ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + Number(ms);
}

export function getCardStartMs(card: PreviewCard): number {
  return card.start_ms !== undefined ? card.start_ms : parseTimeToMs(card.start);
}

export function getCardEndMs(card: PreviewCard): number {
  return card.end_ms !== undefined ? card.end_ms : parseTimeToMs(card.end);
}

function getCardDurationMs(card: PreviewCard): number {
  const startMs = getCardStartMs(card);
  const endMs = getCardEndMs(card);
  return Math.max(100, endMs - startMs);
}

export function ensureSceneIndexes(cards: PreviewCard[], sceneSeconds = 30): PreviewCard[] {
  if (!cards.length) return cards;
  const sceneMs = Math.max(1000, sceneSeconds * 1000);
  let currentScene = 1;
  let prevEnd = getCardEndMs(cards[0]);

  return cards.map((card, idx) => {
    if (idx > 0) {
      const start = getCardStartMs(card);
      if (start - prevEnd > sceneMs) {
        currentScene++;
      }
      prevEnd = Math.max(prevEnd, getCardEndMs(card));
    }
    return card.sceneIndex !== undefined ? card : { ...card, sceneIndex: currentScene };
  });
}

export function checkIsSceneStart(card: PreviewCard, idx: number, list: PreviewCard[]): boolean {
  if (card.sceneIndex === undefined) return false;
  if (idx === 0) return true;
  return card.sceneIndex !== list[idx - 1].sceneIndex;
}

function parseTimeTokenToMs(token: string): number | null {
  const trimmed = token.trim();
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[,.](\d{1,3}))?$/.exec(trimmed);
  if (timeMatch) {
    const p1 = Number(timeMatch[1]);
    const p2 = Number(timeMatch[2]);
    const p3 = timeMatch[3] !== undefined ? Number(timeMatch[3]) : undefined;
    const rawMs = timeMatch[4];
    let ms = 0;
    if (rawMs !== undefined) {
      if (rawMs.length === 1) ms = Number(rawMs) * 100;
      else if (rawMs.length === 2) ms = Number(rawMs) * 10;
      else ms = Number(rawMs.slice(0, 3));
    }
    if (p3 !== undefined) {
      return ((p1 * 60 + p2) * 60 + p3) * 1000 + ms;
    }
    return (p1 * 60 + p2) * 1000 + ms;
  }
  const secMatch = /^(\d+(?:\.\d+)?)s?$/i.exec(trimmed);
  if (secMatch) {
    return Math.round(Number(secMatch[1]) * 1000);
  }
  return null;
}

export function parseTimeSearch(query: string): TimeSearchResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const rangeParts = trimmed.split(/\s*[-~—–]\s*/);
  if (rangeParts.length === 2) {
    const t1 = parseTimeTokenToMs(rangeParts[0]);
    const t2 = parseTimeTokenToMs(rangeParts[1]);
    if (t1 !== null && t2 !== null) {
      return { isTime: true, isRange: true, startMs: Math.min(t1, t2), endMs: Math.max(t1, t2) };
    }
  }
  const t = parseTimeTokenToMs(trimmed);
  if (t !== null) {
    return { isTime: true, isRange: false, startMs: t };
  }
  return null;
}

export function evaluateCardError(card: PreviewCard, targetText: string): CardErrorInfo {
  const trimmed = targetText.trim();
  const missing = !trimmed;
  if (missing) {
    return { missing: true, overLength: false, overCps: false, leaked: false, cps: 0 };
  }
  const durationMs = getCardDurationMs(card);
  const metrics = evaluateLineMetrics(targetText, durationMs, card.targetLang);
  
  const norm = (s: string) => s.replace(/\{\\an[1-9]\}/g, "").replace(/\s+/g, " ").trim();
  const targetNorm = norm(targetText);
  const sourceNorm = norm(card.source);
  const isLeaked = (Boolean(card.leaked) && targetText === card.target) || (targetNorm === sourceNorm && targetNorm.length > 0);

  return {
    missing: false,
    overLength: metrics.overLength,
    overCps: metrics.overCps,
    leaked: isLeaked,
    cps: metrics.cps,
  };
}

export function isCardCategoryActive(err: CardErrorInfo, activeCategories: Set<ErrorCategoryKey>): boolean {
  if (err.missing && activeCategories.has("missing")) return true;
  if (err.overLength && activeCategories.has("overLength")) return true;
  if (err.overCps && activeCategories.has("overCps")) return true;
  if (err.leaked && activeCategories.has("leaked")) return true;
  return false;
}

export function cardClass(err: CardErrorInfo, activeCategories: Set<ErrorCategoryKey>): string {
  if (!isCardCategoryActive(err, activeCategories)) return "";
  if (err.missing && activeCategories.has("missing")) return " preview-card--missing";
  if (err.leaked && activeCategories.has("leaked")) return " preview-card--leaked";
  return " preview-card--warning";
}

export function reasonOf(err: CardErrorInfo, activeCategories: Set<ErrorCategoryKey>): string {
  if (!isCardCategoryActive(err, activeCategories)) return "";
  const reasons: string[] = [];
  if (err.missing && activeCategories.has("missing")) {
    reasons.push(t("preview.warning.missing"));
  }
  if (err.leaked && activeCategories.has("leaked")) {
    reasons.push(t("preview.warning.leaked") || "Possible translation leak");
  }
  if (err.overLength && activeCategories.has("overLength")) {
    reasons.push(t("preview.warning.overLength"));
  }
  if (err.overCps && activeCategories.has("overCps")) {
    reasons.push(t("preview.warning.overCps", { cps: err.cps.toFixed(1) }));
  }
  return reasons.join(" · ");
}

function countLines(text: string, charsPerLine: number): number {
  if (!text) return 1;
  const parts = text.split("\n");
  let total = 0;
  for (const p of parts) {
    total += Math.max(1, Math.ceil(p.length / charsPerLine));
  }
  return Math.max(1, total);
}

export function estimateCardHeight(card: PreviewCard, target: string, hasReason: boolean): number {
  const charsPerLine = typeof window !== "undefined" && window.innerWidth < 640 ? 25 : 42;
  const sourceLines = countLines(card.source, charsPerLine);
  const targetLines = countLines(target, charsPerLine);

  let height = 20;
  height += 20;
  if (hasReason) height += 22;
  height += sourceLines * 18 + 3;
  height += targetLines * 21 + 6;

  return Math.max(76, Math.ceil(height));
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightText(text: string, needle: string): string {
  const safe = escapeHtml(text);
  if (!needle) return safe;
  const safeNeedle = escapeHtml(needle);
  const regex = new RegExp(safeNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return safe.replace(regex, (m) => `<mark class="preview-search-highlight">${m}</mark>`);
}
