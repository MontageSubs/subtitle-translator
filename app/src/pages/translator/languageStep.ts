import { t, getLocale, onLocaleChange } from "../../i18n";
import { mountLanguageSelect } from "../../components/languageSelect";
import { mountModelCardSelect } from "../../components/modelCardSelect";
import { SELECTABLE_LANGUAGE_CODES, AUTO_DETECT_CODE, languageLabel, quickPickLanguageCodes } from "../../utils/languageProfiles";
import { supportedCodesFor } from "../../utils/providerLanguages";
import { detectSourceLanguage, isKnownSourceLanguage, normalizeDetectedCode } from "../../utils/detect";
import { preloadLineBreakSegmenter } from "../../lib/subtitle/postprocess/lineWrap";
import { PROVIDER_STORAGE_KEY } from "./state";
import type { WorkspaceContext } from "./context";

export interface LanguageStepHandle {
  sourceCode(): string;
  targetCode(): string;
  directionLabels(): { source: string; target: string };
  setResolvedSource(code: string): void;
  runLocalDetection(): Promise<void>;
}

function fillSelect(select: HTMLSelectElement, codes: readonly string[], selected: string, includeAuto = false): void {
  const autoOption = includeAuto ? `<option value="${AUTO_DETECT_CODE}">${t("lang.autoDetect")}</option>` : "";
  select.innerHTML = autoOption + codes.map((code) => `<option value="${code}">${languageLabel(code)} (${code})</option>`).join("");
  select.value = selected;
}

function selectedLabel(select: HTMLSelectElement, fallback: string): string {
  return select.options[select.selectedIndex]?.text.split(" (")[0] || fallback;
}

function pickFallbackTarget(excluded: string): string {
  const candidates = [getLocale(), ...quickPickLanguageCodes(getLocale()), ...SELECTABLE_LANGUAGE_CODES];
  return candidates.find((code) => code !== excluded) || SELECTABLE_LANGUAGE_CODES[0];
}

export function mountLanguageStep(ctx: WorkspaceContext): LanguageStepHandle {
  const { state, signal } = ctx;
  const providerSelect = ctx.query<HTMLSelectElement>("#provider-select");
  const sourceSelect = ctx.query<HTMLSelectElement>("#source-lang");
  const targetSelect = ctx.query<HTMLSelectElement>("#target-lang");
  const entries = SELECTABLE_LANGUAGE_CODES.map((code) => ({ code }));

  fillSelect(sourceSelect, SELECTABLE_LANGUAGE_CODES, state.sourceLang, true);
  fillSelect(targetSelect, SELECTABLE_LANGUAGE_CODES, state.targetLang);
  providerSelect.value = state.provider;

  const sourceCombo = mountLanguageSelect({
    select: sourceSelect,
    container: ctx.query("#source-lang-combo"),
    entries,
    pinnedEntries: [
      { code: "__detect_local__", label: t("detect.mode.local"), onSelect: () => { void runLocalDetection(); } },
      { code: AUTO_DETECT_CODE, label: t("detect.mode.cloud") },
    ],
    excludeCode: () => targetSelect.value,
    supportedCodes: () => supportedCodesFor(providerSelect.value, SELECTABLE_LANGUAGE_CODES),
    searchPlaceholder: t("lang.searchPlaceholder"),
    ariaLabelledBy: "source-lang-label",
    signal,
  });
  const targetCombo = mountLanguageSelect({
    select: targetSelect,
    container: ctx.query("#target-lang-combo"),
    entries,
    quickCodes: quickPickLanguageCodes(getLocale()),
    excludeCode: () => (sourceSelect.value === AUTO_DETECT_CODE ? undefined : sourceSelect.value),
    supportedCodes: () => supportedCodesFor(providerSelect.value, SELECTABLE_LANGUAGE_CODES),
    searchPlaceholder: t("lang.searchPlaceholder"),
    ariaLabelledBy: "target-lang-label",
    signal,
  });

  function refreshDerivedFields(): void {
    ctx.output.applyLanguageDefaults();
    ctx.task.updateHeader();
  }

  let applyingDetectedSourceLang = false;

  async function runLocalDetection(): Promise<void> {
    if (!state.files.length) return;
    const detected = await detectSourceLanguage(state.files[0]?.cues || []);
    applyingDetectedSourceLang = true;
    if (detected?.reliable && isKnownSourceLanguage(detected.code)) {
      const normalized = normalizeDetectedCode(detected.code);
      sourceCombo.setValue(normalized);
      void ctx.assist.loadDictionaryFor(normalized);
    } else {
      sourceCombo.setValue(AUTO_DETECT_CODE);
    }
    applyingDetectedSourceLang = false;
    state.userPickedSourceLang = false;
    refreshDerivedFields();
    ctx.assist.scene.updatePreview();
  }

  mountModelCardSelect(ctx.root, providerSelect);
  providerSelect.addEventListener("change", () => {
    state.provider = providerSelect.value;
    localStorage.setItem(PROVIDER_STORAGE_KEY, state.provider);
    ctx.assist.context.syncAvailability();
  }, { signal });

  targetSelect.addEventListener("change", () => {
    state.targetLang = targetSelect.value;
    state.userPickedTargetLang = true;
    preloadLineBreakSegmenter(targetSelect.value);
    if (sourceSelect.value !== AUTO_DETECT_CODE && sourceSelect.value === targetSelect.value) {
      sourceSelect.value = AUTO_DETECT_CODE;
      sourceCombo.refresh();
      state.sourceLang = AUTO_DETECT_CODE;
      void runLocalDetection();
    }
    refreshDerivedFields();
  }, { signal });

  sourceSelect.addEventListener("change", () => {
    state.sourceLang = sourceSelect.value;
    const autoDetect = sourceSelect.value === AUTO_DETECT_CODE;
    if (!applyingDetectedSourceLang) state.userPickedSourceLang = !autoDetect;
    if (!autoDetect && sourceSelect.value === targetSelect.value) {
      const fallback = pickFallbackTarget(sourceSelect.value);
      targetSelect.value = fallback;
      targetCombo.refresh();
      state.targetLang = fallback;
    }
    if (!autoDetect) void ctx.assist.loadDictionaryFor(sourceSelect.value);
    refreshDerivedFields();
  }, { signal });

  const unsubscribeLocale = onLocaleChange((locale) => {
    if (state.userPickedTargetLang || state.targetLang === locale) return;
    state.targetLang = locale;
    targetSelect.value = locale;
    targetCombo.refresh();
    refreshDerivedFields();
  });
  signal.addEventListener("abort", unsubscribeLocale, { once: true });

  return {
    sourceCode: () => sourceSelect.value,
    targetCode: () => targetSelect.value,
    directionLabels: () => ({
      source: selectedLabel(sourceSelect, state.sourceLang),
      target: selectedLabel(targetSelect, state.targetLang),
    }),
    setResolvedSource: (code) => sourceCombo.setValue(code),
    runLocalDetection,
  };
}
