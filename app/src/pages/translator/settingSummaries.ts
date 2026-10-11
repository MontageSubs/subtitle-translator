import { t, TranslationKey } from "../../i18n";
import type { AssFontPreset } from "../../lib/subtitle/formats/ass/template";
import type { CueLayout } from "../../lib/subtitle/types";
import type { WorkspaceState } from "./state";
import type { WorkspaceContext } from "./context";

type Summarizer = (state: WorkspaceState) => string[];

const CUE_LAYOUT_KEYS: Record<CueLayout, TranslationKey> = {
  single: "cueLayout.single",
  split: "cueLayout.split",
};

const ASS_SIZE_KEYS: Record<AssFontPreset, TranslationKey> = {
  desktop: "ass.preset.desktop",
  mobile: "ass.preset.mobile",
  custom: "ass.preset.custom",
};

const labeled = (fieldKey: TranslationKey, valueKey: TranslationKey): string => `${t(fieldKey)}: ${t(valueKey)}`;

const SUMMARIZERS: Record<string, Summarizer> = {
  source: (state) => [t(state.sdhEnabled ? "sdh.summaryOn" : "sdh.summaryOff")],
  terms: (state) => (state.contextText.trim() ? [t("task.tag.context")] : []),
  output: (state) => [
    labeled("field.cueLayout", CUE_LAYOUT_KEYS[state.cueLayout]),
    labeled("ass.sizeLabel", ASS_SIZE_KEYS[state.assFontPreset ?? "desktop"]),
  ],
};

export interface SettingSummariesHandle {
  refresh(): void;
}

export function mountSettingSummaries(ctx: WorkspaceContext): SettingSummariesHandle {
  const entries = Object.entries(SUMMARIZERS).map(([id, summarize]) => ({
    element: ctx.query<HTMLElement>(`#${id}-more`),
    label: ctx.query<HTMLElement>(`#${id}-more-state`),
    summarize,
  }));

  function refresh(): void {
    entries.forEach(({ label, summarize }) => { label.textContent = summarize(ctx.state).join(" · "); });
  }

  entries.forEach(({ element }) => {
    (["input", "change", "click"] as const).forEach((type) => element.addEventListener(type, refresh, { signal: ctx.signal }));
  });
  refresh();

  return { refresh };
}
