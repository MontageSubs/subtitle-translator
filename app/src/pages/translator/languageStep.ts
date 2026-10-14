import { persistentStorage } from "../../utils/safeStorage";
import { t, getLocale, onLocaleChange } from "../../i18n";
import { mountLanguageSelect } from "../../components/languageSelect";
import { mountModelCardSelect, mountModelMore } from "../../components/modelCardSelect";
import { SELECTABLE_LANGUAGE_CODES, SOURCE_LANGUAGE_CODES, AUTO_DETECT_CODE, languageLabel, quickPickLanguageCodes } from "../../utils/languageProfiles";
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
  select.innerHTML = autoOption + codes.map((code) => `<option value="${code}">${languageLabel(code)}</option>`).join("");
  select.value = selected;
}

function pickFallbackTarget(provider: string, preferred: string, excluded: string | undefined): string {
  const supported = supportedCodesFor(provider, SELECTABLE_LANGUAGE_CODES);
  const candidates = [preferred.split("-")[0], getLocale(), ...quickPickLanguageCodes(getLocale()), ...SELECTABLE_LANGUAGE_CODES];
  return candidates.find((code) => supported.has(code) && code !== excluded) ?? SELECTABLE_LANGUAGE_CODES[0];
}

function reconcileStateLanguages(state: WorkspaceContext["state"]): void {
  if (!supportedCodesFor(state.provider, SOURCE_LANGUAGE_CODES).has(state.sourceLang)) state.sourceLang = AUTO_DETECT_CODE;
  if (!supportedCodesFor(state.provider, SELECTABLE_LANGUAGE_CODES).has(state.targetLang)) {
    state.targetLang = pickFallbackTarget(state.provider, state.targetLang, state.sourceLang === AUTO_DETECT_CODE ? undefined : state.sourceLang);
  }
}

const LOCAL_DETECT_CODE = "__detect_local__";

export function mountLanguageStep(ctx: WorkspaceContext): LanguageStepHandle {
  const { state, signal } = ctx;
  const providerSelect = ctx.query<HTMLSelectElement>("#provider-select");
  const sourceSelect = ctx.query<HTMLSelectElement>("#source-lang");
  const targetSelect = ctx.query<HTMLSelectElement>("#target-lang");
  const targetEntries = SELECTABLE_LANGUAGE_CODES.map((code) => ({ code }));
  const sourceEntries = SOURCE_LANGUAGE_CODES.map((code) => ({ code }));
  let detectedCode: string | undefined;

  reconcileStateLanguages(state);
  fillSelect(sourceSelect, SOURCE_LANGUAGE_CODES, state.sourceLang, true);
  fillSelect(targetSelect, SELECTABLE_LANGUAGE_CODES, state.targetLang);
  providerSelect.value = state.provider;

  const sourceCombo = mountLanguageSelect({
    select: sourceSelect,
    container: ctx.query("#source-lang-combo"),
    entries: sourceEntries,
    featured: () => [
      {
        code: LOCAL_DETECT_CODE,
        label: detectedCode ? t("detect.mode.localDone", { language: languageLabel(detectedCode) }) : t("detect.mode.local"),
        selected: detectedCode !== undefined && sourceSelect.value === detectedCode,
        onSelect: () => { void runLocalDetection(); },
      },
      { code: AUTO_DETECT_CODE, label: t("detect.mode.cloud") },
    ],
    featuredLabel: t("languageSelect.detection"),
    excludeCode: () => targetSelect.value,
    supportedCodes: () => supportedCodesFor(providerSelect.value, SOURCE_LANGUAGE_CODES),
    searchPlaceholder: t("lang.searchPlaceholder"),
    ariaLabelledBy: "source-lang-label",
    signal,
  });
  const targetCombo = mountLanguageSelect({
    select: targetSelect,
    container: ctx.query("#target-lang-combo"),
    entries: targetEntries,
    featured: () => quickPickLanguageCodes(getLocale()).map((code) => ({ code })),
    featuredLabel: t("languageSelect.suggested"),
    excludeCode: () => (sourceSelect.value === AUTO_DETECT_CODE ? undefined : sourceSelect.value),
    supportedCodes: () => supportedCodesFor(providerSelect.value, SELECTABLE_LANGUAGE_CODES),
    searchPlaceholder: t("lang.searchPlaceholder"),
    ariaLabelledBy: "target-lang-label",
    signal,
  });

  let applyingDetectedSourceLang = false;

  async function runLocalDetection(): Promise<void> {
    if (!state.files.length) return;
    const detected = await detectSourceLanguage(state.files[0]?.cues || []);
    applyingDetectedSourceLang = true;
    if (detected?.reliable && isKnownSourceLanguage(detected.code)) {
      detectedCode = normalizeDetectedCode(detected.code);
      sourceCombo.setValue(detectedCode);
      ctx.flow.sourceLanguageChosen(detectedCode);
      ctx.announce(t("a11y.sourceDetected", { language: languageLabel(detectedCode) }));
    } else {
      detectedCode = undefined;
      sourceCombo.setValue(AUTO_DETECT_CODE);
    }
    applyingDetectedSourceLang = false;
    state.userPickedSourceLang = false;
    ctx.flow.languageDetected();
  }

  mountModelCardSelect(ctx.root, providerSelect);
  mountModelMore(ctx.root);
  function reconcileWithProvider(): void {
    const provider = providerSelect.value;
    if (sourceSelect.value !== AUTO_DETECT_CODE && !supportedCodesFor(provider, SOURCE_LANGUAGE_CODES).has(sourceSelect.value)) {
      sourceCombo.setValue(AUTO_DETECT_CODE);
    }
    if (supportedCodesFor(provider, SELECTABLE_LANGUAGE_CODES).has(targetSelect.value)) return;
    const userPicked = state.userPickedTargetLang;
    const fallback = pickFallbackTarget(provider, targetSelect.value, sourceSelect.value === AUTO_DETECT_CODE ? undefined : sourceSelect.value);
    targetCombo.setValue(fallback);
    state.userPickedTargetLang = userPicked;
    ctx.announce(t("a11y.targetChanged", { language: languageLabel(fallback) }));
  }

  providerSelect.addEventListener("change", () => {
    state.provider = providerSelect.value;
    reconcileWithProvider();
    persistentStorage.setItem(PROVIDER_STORAGE_KEY, state.provider);
    ctx.flow.providerChanged();
  }, { signal });

  targetSelect.addEventListener("change", () => {
    state.targetLang = targetSelect.value;
    state.userPickedTargetLang = true;
    preloadLineBreakSegmenter(targetSelect.value);
    if (sourceSelect.value !== AUTO_DETECT_CODE && sourceSelect.value === targetSelect.value) {
      sourceSelect.value = AUTO_DETECT_CODE;
      sourceCombo.refresh();
      state.sourceLang = AUTO_DETECT_CODE;
      ctx.announce(t("a11y.sourceReset"));
      void runLocalDetection();
    }
    ctx.flow.languageChanged();
  }, { signal });

  sourceSelect.addEventListener("change", () => {
    if (sourceSelect.value !== detectedCode) detectedCode = undefined;
    state.sourceLang = sourceSelect.value;
    const autoDetect = sourceSelect.value === AUTO_DETECT_CODE;
    if (!applyingDetectedSourceLang) state.userPickedSourceLang = !autoDetect;
    if (!autoDetect && sourceSelect.value === targetSelect.value) {
      const fallback = pickFallbackTarget(providerSelect.value, "", sourceSelect.value);
      targetSelect.value = fallback;
      targetCombo.refresh();
      state.targetLang = fallback;
      ctx.announce(t("a11y.targetChanged", { language: languageLabel(fallback) }));
    }
    if (!autoDetect) ctx.flow.sourceLanguageChosen(sourceSelect.value);
    ctx.flow.languageChanged();
  }, { signal });

  const unsubscribeLocale = onLocaleChange((locale) => {
    if (state.userPickedTargetLang || state.targetLang === locale) return;
    state.targetLang = locale;
    targetSelect.value = locale;
    targetCombo.refresh();
    ctx.flow.languageChanged();
  });
  signal.addEventListener("abort", unsubscribeLocale, { once: true });

  return {
    sourceCode: () => sourceSelect.value,
    targetCode: () => targetSelect.value,
    directionLabels: () => ({
      source: sourceSelect.value === AUTO_DETECT_CODE ? t("lang.autoDetect") : languageLabel(sourceSelect.value),
      target: languageLabel(targetSelect.value),
    }),
    setResolvedSource: (code) => sourceCombo.setValue(code),
    runLocalDetection,
  };
}
