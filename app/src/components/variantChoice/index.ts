import type { VariantGroup } from "../../lib/subtitle/variants/types";
import { openModal } from "../modal";
import { createChoiceState, resolveSelection, selectKey, setPerFile, stepFile } from "./choiceState";
import { renderChoiceContent, renderChoiceModal, renderFallbackNote } from "./modalMarkup";

export interface VariantChoiceRequest {
  groups: readonly VariantGroup[];
  languageOrder: readonly string[];
  initialKeys?: ReadonlyMap<string, string>;
}

export type VariantChoiceResult = ReadonlyMap<string, string>;

export function openVariantChoiceModal({ groups, languageOrder, initialKeys }: VariantChoiceRequest): Promise<VariantChoiceResult | null> {
  const state = createChoiceState(groups, languageOrder, initialKeys);
  return new Promise((resolve) => {
    let result: VariantChoiceResult | null = null;
    const modal = openModal({ html: renderChoiceModal(state), onClosed: () => resolve(result) });
    const content = modal.query<HTMLElement>("#variant-content");

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
        const note = modal.query<HTMLElement>("#variant-note");
        note.textContent = renderFallbackNote(state);
      }
    }, { signal: modal.signal });

    modal.backdrop.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const step = target.closest<HTMLElement>("[data-scope-step]");
      const toggle = target.closest<HTMLButtonElement>(".variant-row__toggle");
      if (step) {
        const delta = Number(step.dataset.scopeStep);
        stepFile(state, delta);
        renderContent(`[data-scope-step="${delta}"]`);
      } else if (toggle) {
        const expanded = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.closest(".variant-row")?.querySelector<HTMLElement>(".variant-row__files")?.toggleAttribute("hidden", !expanded);
      } else if (target.closest("[data-variant-confirm]")) {
        result = resolveSelection(state);
        modal.close();
      } else if (target.closest("[data-variant-cancel]")) {
        modal.requestClose();
      }
    }, { signal: modal.signal });

    content.querySelector<HTMLElement>("input:checked")?.focus({ preventScroll: true });
  });
}
