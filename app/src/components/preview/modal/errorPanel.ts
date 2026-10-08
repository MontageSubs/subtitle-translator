import { t } from "../../../i18n";
import { countCategories, evaluateCardError, isCategoryActive, isSevere, isSoftWarning } from "../metrics/cardErrors";
import { isSceneStart } from "../metrics/sceneIndex";
import { SCENE_DIVIDER_HEIGHT } from "../list/layout";
import { ErrorCategoryKey, PreviewCard } from "../types";
import type { PreviewSession } from "./session";

export interface ErrorPanelHandle {
  render(): void;
  renderMinimap(): void;
  evaluateCard(card: PreviewCard, text: string): void;
}

interface CategoryButton {
  key: ErrorCategoryKey;
  className: (soft: boolean) => string;
  label: string;
}

const MARKER_MIN_HEIGHT_PCT = 0.6;
const ACTIVE_MARKER_MIN_HEIGHT_PCT = 1.5;
const FALLBACK_CARD_HEIGHT = 60;

function categoryButtons(): CategoryButton[] {
  return [
    { key: "missing", className: () => "preview-error-category-btn--missing", label: `✕ ${t("preview.warning.missing")}` },
    { key: "leaked", className: () => "preview-error-category-btn--missing", label: `✕ ${t("preview.warning.leaked")}` },
    { key: "overLength", className: (soft) => (soft ? "preview-error-category-btn--soft-warning" : "preview-error-category-btn--warning"), label: `⚠ ${t("preview.warning.overLength")}` },
    { key: "overCps", className: () => "preview-error-category-btn--warning", label: `⚠ ${t("preview.warning.overCpsLabel")}` },
  ];
}

function markerStyle(top: number, height: number, totalHeight: number, minPct: number): string {
  const topPct = (top / totalHeight) * 100;
  const heightPct = Math.max(minPct, (height / totalHeight) * 100);
  return `top:${topPct.toFixed(2)}%;height:${heightPct.toFixed(2)}%;`;
}

function renderMarker(classes: string, style: string, id: number): string {
  return `<div class="preview-minimap__marker ${classes}" style="${style}" title="#${id}" data-jump="${id}"></div>`;
}

export function mountErrorPanel(session: PreviewSession): ErrorPanelHandle {
  const area = session.query<HTMLElement>("#preview-error-area");
  const buttonsHost = session.query<HTMLElement>("#preview-error-buttons");
  const cuesHost = session.query<HTMLElement>("#preview-error-cues");
  const minimap = session.query<HTMLElement>("#preview-minimap");

  function problemChips(): string {
    return session.cards
      .filter((card) => isCategoryActive(session.errorMap.get(card.id)!, session.activeCategories))
      .map((card) => {
        const error = session.errorMap.get(card.id)!;
        const variant = isSevere(error, session.activeCategories)
          ? " preview-problem-chip--missing"
          : isSoftWarning(error, session.activeCategories, session.softWarningMode) ? " preview-problem-chip--soft-warning" : "";
        return `<button type="button" class="preview-problem-chip${variant}" data-jump="${card.id}">#${card.id}</button>`;
      })
      .join("");
  }

  function markerFor(card: PreviewCard, index: number, displayed: PreviewCard[], matchedIds: number[], activeId: number | null): string {
    const { offsets, totalHeight } = session.view.getLayoutMetrics();
    const sceneStart = isSceneStart(card, index, displayed);
    const top = offsets[index] + (sceneStart ? SCENE_DIVIDER_HEIGHT : 0);
    const height = (offsets[index + 1] || offsets[index] + FALLBACK_CARD_HEIGHT) - top;
    const error = session.errorMap.get(card.id)!;

    if (isCategoryActive(error, session.activeCategories)) {
      const variant = isSevere(error, session.activeCategories)
        ? "preview-minimap__marker--missing"
        : isSoftWarning(error, session.activeCategories, session.softWarningMode) ? "preview-minimap__marker--soft-warning" : "preview-minimap__marker--warning";
      return renderMarker(variant, markerStyle(top, height, totalHeight, MARKER_MIN_HEIGHT_PCT), card.id);
    }
    if (!matchedIds.includes(card.id)) return "";
    const active = card.id === activeId ? " preview-minimap__marker--active" : "";
    return renderMarker(`preview-minimap__marker--search${active}`, markerStyle(top, height, totalHeight, MARKER_MIN_HEIGHT_PCT), card.id);
  }

  function minimapMarkers(): string[] {
    const displayed = session.view.getDisplayedCards();
    const matchedIds = session.view.getMatchedIds();
    const activeId = session.view.getActiveMatchCardId();
    const { offsets, totalHeight } = session.view.getLayoutMetrics();
    if (totalHeight <= 0) return [];

    if (session.searchMode === "filter") {
      const index = displayed.findIndex((card) => card.id === activeId);
      if (index < 0) return [];
      const sceneStart = isSceneStart(displayed[index], index, displayed);
      const top = offsets[index] + (sceneStart ? SCENE_DIVIDER_HEIGHT : 0);
      const height = (offsets[index + 1] || offsets[index] + FALLBACK_CARD_HEIGHT) - top;
      return [renderMarker("preview-minimap__marker--search preview-minimap__marker--active", markerStyle(top, height, totalHeight, ACTIVE_MARKER_MIN_HEIGHT_PCT), displayed[index].id)];
    }
    return displayed.map((card, index) => markerFor(card, index, displayed, matchedIds, activeId)).filter(Boolean);
  }

  function renderMinimap(): void {
    const counts = countCategories(session.errorMap.values());
    const totalErrors = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (totalErrors === 0 && session.view.getMatchedIds().length === 0) {
      cuesHost.hidden = true;
      minimap.hidden = true;
      minimap.innerHTML = "";
      return;
    }
    cuesHost.hidden = session.activeCategories.size === 0;
    cuesHost.innerHTML = problemChips();
    const markers = minimapMarkers();
    minimap.innerHTML = markers.join("");
    minimap.hidden = markers.length === 0;
  }

  function renderCategoryButtons(counts: Record<ErrorCategoryKey, number>): void {
    buttonsHost.innerHTML = categoryButtons()
      .filter(({ key }) => counts[key] > 0)
      .map(({ key, className, label }) => {
        const active = session.activeCategories.has(key);
        return `<button type="button" class="preview-error-category-btn ${className(session.softWarningMode)}${active ? " preview-error-category-btn--active" : ""}" data-category="${key}" aria-pressed="${active}">
          ${label} (${counts[key]})
        </button>`;
      })
      .join("");
  }

  function render(): void {
    session.errorMap.clear();
    session.cards.forEach((card) => session.errorMap.set(card.id, evaluateCardError(card, session.editor.targetOf(card))));
    const counts = countCategories(session.errorMap.values());
    session.activeCategories.forEach((key) => { if (counts[key] === 0) session.activeCategories.delete(key); });

    const hasErrors = Object.values(counts).some((count) => count > 0);
    area.hidden = !hasErrors;
    if (hasErrors) renderCategoryButtons(counts);
    renderMinimap();
  }

  function jumpTo(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-jump]");
    if (target) session.view.scrollToId(Number(target.dataset.jump));
  }

  cuesHost.addEventListener("click", jumpTo);
  minimap.addEventListener("click", jumpTo);
  buttonsHost.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-category]");
    if (!button) return;
    const category = button.dataset.category as ErrorCategoryKey;
    if (!session.activeCategories.delete(category)) session.activeCategories.add(category);
    render();
    session.view.refresh();
  });

  return {
    render,
    renderMinimap,
    evaluateCard(card, text) {
      session.errorMap.set(card.id, evaluateCardError(card, text));
    },
  };
}
