import { t, type TranslationKey } from "../../i18n";
import { escapeHtml } from "../../utils/escapeHtml";
import { tipAttr } from "../../utils/labelAttrs";
import type { GlossaryFooterSlot } from "../../components/glossaryMarkup";

export type PrimaryAction = "detect" | "pause" | "continue";
export type SecondaryAction = "send" | "retranslate" | "cancel";
export type RecognitionAction = PrimaryAction | SecondaryAction;

export interface RecognitionPanelState {
  supported: boolean;
  action: PrimaryAction;
  redetect: boolean;
  secondary: SecondaryAction | null;
  status: string;
  barVisible: boolean;
  barIndeterminate: boolean;
  barFraction: number;
  depth: number;
  depthLocked: boolean;
  depthMax: number;
}

export interface RecognitionPanel {
  slot: GlossaryFooterSlot;
  paint(): void;
  paintBar(): void;
  paintDepth(): void;
}

const ACTION_LABEL_KEYS: Record<RecognitionAction, TranslationKey> = {
  detect: "terms.recognize.action.detect",
  pause: "terms.recognize.action.pause",
  continue: "terms.recognize.action.continue",
  send: "terms.recognize.action.send",
  retranslate: "terms.recognize.action.retranslate",
  cancel: "terms.recognize.action.cancel",
};

const ACTION_TIP_KEYS: Record<RecognitionAction, TranslationKey> = {
  detect: "tip.recognizeTerms",
  pause: "tip.recognizePause",
  continue: "tip.recognizeContinue",
  send: "tip.recognizeSend",
  retranslate: "tip.recognizeRetranslate",
  cancel: "tip.recognizeCancel",
};

const primaryIsAccent = (secondary: SecondaryAction | null): boolean => secondary === null || secondary === "cancel";

const primaryLabel = ({ action, redetect }: RecognitionPanelState): string => t(redetect ? "terms.recognize.action.redetect" : ACTION_LABEL_KEYS[action]);

const primaryTip = ({ action, redetect }: RecognitionPanelState): string => t(redetect ? "tip.recognizeRedetect" : ACTION_TIP_KEYS[action]);

export function createRecognitionPanel(host: HTMLElement, read: () => RecognitionPanelState): RecognitionPanel {
  function paintBar(fill: HTMLElement | null = host.querySelector<HTMLElement>("#term-recognize-fill")): void {
    if (!fill) return;
    const { barIndeterminate, barFraction } = read();
    const className = barIndeterminate ? "task-progress-fill task-progress-fill--indeterminate" : "task-progress-fill";
    if (fill.className !== className) fill.className = className;
    if (barIndeterminate) fill.style.removeProperty("--progress");
    else fill.style.setProperty("--progress", barFraction.toFixed(4));
  }

  const depthText = ({ depth, depthLocked, depthMax }: RecognitionPanelState): string => {
    if (depthLocked) return t("terms.recognize.depth.descLocked");
    if (depth === 0) return t("terms.recognize.depth.descReduced");
    return t(depth === depthMax ? "terms.recognize.depth.descSequential" : "terms.recognize.depth.desc");
  };

  const depthName = (depth: number): string => t(`terms.recognize.depth.level${depth}` as TranslationKey);

  function paintDepth(): void {
    const state = read();
    const value = host.querySelector<HTMLElement>("#term-depth-value");
    const field = host.querySelector<HTMLInputElement>("#term-depth");
    const description = host.querySelector<HTMLElement>("#term-depth-desc");
    if (value) value.textContent = depthName(state.depth);
    if (description) description.textContent = depthText(state);
    if (field) {
      field.value = String(state.depth);
      field.disabled = state.depthLocked;
      field.setAttribute("aria-valuetext", depthName(state.depth));
    }
  }

  function paint(): void {
    const state = read();
    const depthRow = host.querySelector<HTMLElement>("#term-depth-row");
    if (depthRow) depthRow.hidden = !state.supported;
    paintDepth();
    const button = host.querySelector<HTMLButtonElement>("#term-recognize-button");
    const translateButton = host.querySelector<HTMLButtonElement>("#term-translate-button");
    const region = host.querySelector<HTMLElement>("#term-recognize-status");
    const bar = host.querySelector<HTMLElement>("#term-recognize-bar");
    const fill = host.querySelector<HTMLElement>("#term-recognize-fill");
    const text = host.querySelector<HTMLElement>("#term-recognize-text");
    if (!button || !translateButton || !region || !bar || !fill || !text) return;
    button.hidden = !state.supported;
    button.textContent = primaryLabel(state);
    button.title = primaryTip(state);
    button.dataset.recognize = state.action;
    button.classList.toggle("action-pill--accent", primaryIsAccent(state.secondary));
    translateButton.hidden = !state.supported || state.secondary === null;
    if (state.secondary) {
      translateButton.dataset.recognize = state.secondary;
      translateButton.textContent = t(ACTION_LABEL_KEYS[state.secondary]);
      translateButton.title = t(ACTION_TIP_KEYS[state.secondary]);
      translateButton.classList.toggle("action-pill--accent", state.secondary === "send");
    }
    region.hidden = !state.supported || (!state.status && !state.barVisible);
    text.textContent = state.status;
    text.hidden = !state.status;
    bar.hidden = !state.barVisible;
    paintBar(fill);
  }

  const slot: GlossaryFooterSlot = {
    actionMarkup() {
      const state = read();
      const secondary = state.secondary ?? "send";
      return `<button type="button" class="action-pill${primaryIsAccent(state.secondary) ? " action-pill--accent" : ""}" id="term-recognize-button" data-recognize="${state.action}" ${tipAttr(primaryTip(state))}${state.supported ? "" : " hidden"}>${escapeHtml(primaryLabel(state))}</button>
        <button type="button" class="action-pill${secondary === "send" ? " action-pill--accent" : ""}" id="term-translate-button" data-recognize="${secondary}" ${tipAttr(t(ACTION_TIP_KEYS[secondary]))}${state.supported && state.secondary ? "" : " hidden"}>${escapeHtml(t(ACTION_LABEL_KEYS[secondary]))}</button>`;
    },
    statusMarkup() {
      const state = read();
      const name = depthName(state.depth);
      return `<div class="slider-row" id="term-depth-row"${state.supported ? "" : " hidden"}>
        <div class="slider-row__line">
          <label class="slider-row__label" for="term-depth">${escapeHtml(t("terms.recognize.depth.label"))}</label>
          <div class="slider-row__control">
            <input type="range" id="term-depth" min="0" max="${state.depthMax}" step="1" value="${state.depth}"${state.depthLocked ? " disabled" : ""} aria-describedby="term-depth-desc" aria-valuetext="${escapeHtml(name)}" />
            <output class="slider-row__value" id="term-depth-value" for="term-depth">${escapeHtml(name)}</output>
          </div>
        </div>
        <p class="field__desc" id="term-depth-desc">${escapeHtml(depthText(state))}</p>
      </div>
            <div class="glossary__recognition" id="term-recognize-status" role="status" aria-live="polite" hidden>
        <span class="field__desc" id="term-recognize-text"></span>
        <div class="task-progress-container" id="term-recognize-bar" aria-hidden="true" hidden><div class="task-progress-fill" id="term-recognize-fill"></div></div>
      </div>`;
    },
    mounted: paint,
  };

  return { slot, paint, paintBar, paintDepth };
}
