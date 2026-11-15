import type { LanguagePreference } from "../../lib/subtitle/variants/selection";
import type { VariantGroup } from "../../lib/subtitle/variants/types";
import { openModal } from "../modal";
import { openSourcePreview } from "../preview";
import { canSelectPerFile, ChoiceState, createChoiceState, resolveSelection, selectKey, setPerFile, stepFile } from "./choiceState";
import { renderChoiceContent, renderChoiceModal, renderFallbackNote } from "./modalMarkup";

export interface VariantChoiceRequest {
  groups: readonly VariantGroup[];
  preference: LanguagePreference;
  avoidLanguage?: string;
  initialKeys?: ReadonlyMap<string, string>;
}

export type VariantChoiceResult = ReadonlyMap<string, string>;

const MAX_CONTENT_VIEWPORT_RATIO = 0.55;

function tallestContentHeight(state: ChoiceState, content: HTMLElement): number {
  const { perFile, activeIndex } = state;
  const views: (() => void)[] = [() => { state.perFile = false; }];
  if (canSelectPerFile(state)) state.groups.forEach((_, index) => views.push(() => { state.perFile = true; state.activeIndex = index; }));
  let tallest = 0;
  for (const select of views) {
    select();
    content.innerHTML = renderChoiceContent(state);
    tallest = Math.max(tallest, content.offsetHeight);
  }
  state.perFile = perFile;
  state.activeIndex = activeIndex;
  content.innerHTML = renderChoiceContent(state);
  return Math.min(tallest, Math.round(window.innerHeight * MAX_CONTENT_VIEWPORT_RATIO));
}

export function openVariantChoiceModal({ groups, preference, avoidLanguage, initialKeys }: VariantChoiceRequest): Promise<VariantChoiceResult | null> {
  const state = createChoiceState(groups, preference, avoidLanguage, initialKeys);
  return new Promise((resolve) => {
    let discarded = false;
    const modal = openModal({ html: renderChoiceModal(state), onClosed: () => resolve(discarded ? null : resolveSelection(state)) });
    const content = modal.query<HTMLElement>("#variant-content");
    if (canSelectPerFile(state)) content.style.height = `${tallestContentHeight(state, content)}px`;

    function renderContent(focusSelector: string): void {
      content.innerHTML = renderChoiceContent(state);
      const target = content.querySelector<HTMLElement>(`${focusSelector}:not(:disabled)`) ?? content.querySelector<HTMLElement>("input:checked");
      target?.focus({ preventScroll: true });
    }

    modal.backdrop.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.id === "variant-per-file") {
        setPerFile(state, target.checked);
        renderContent("input:checked");
      } else if (target.classList.contains("variant-row__input")) {
        selectKey(state, target.value);
        modal.query<HTMLElement>("#variant-note").textContent = renderFallbackNote(state);
      }
    }, { signal: modal.signal });

    const toggleExpanded = (row: HTMLElement): void => {
      const open = row.toggleAttribute("data-open");
      row.querySelector(".variant-row__input")?.setAttribute("aria-expanded", String(open));
    };

    modal.backdrop.addEventListener("keydown", (event) => {
      const row = event.key === "Enter" && event.target instanceof HTMLInputElement ? event.target.closest<HTMLElement>(".variant-row[data-expandable]") : null;
      if (!row) return;
      event.preventDefault();
      toggleExpanded(row);
    }, { signal: modal.signal });

    modal.backdrop.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const view = target.closest<HTMLElement>("[data-variant-view]");
      if (view) {
        const variant = groups.flatMap((group) => group.variants).find(({ id }) => id === view.dataset.variantView);
        if (variant) openSourcePreview({ bytes: variant.bytes, filename: variant.fileName });
        return;
      }
      const step = target.closest<HTMLElement>("[data-scope-step]");
      const expandable = target instanceof HTMLInputElement ? null : target.closest<HTMLElement>(".variant-row[data-expandable]");
      if (step) {
        const delta = Number(step.dataset.scopeStep);
        stepFile(state, delta);
        renderContent(`[data-scope-step="${delta}"]`);
      } else if (expandable) {
        toggleExpanded(expandable);
      } else if (target.closest("[data-variant-confirm]")) {
        modal.close();
      } else if (target.closest("[data-variant-cancel]")) {
        discarded = true;
        modal.close();
      }
    }, { signal: modal.signal });

    content.querySelector<HTMLElement>("input:checked")?.focus({ preventScroll: true });
  });
}
