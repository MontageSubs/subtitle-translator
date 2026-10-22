import { persistentStorage } from "../../utils/safeStorage";
import { t, getLocale, isLocaleCode, loadLocale, onLocaleChange } from "../../i18n";
import { mountLanguageSelect } from "../../components/languageSelect";
import { mountModelCardSelect, mountModelMore } from "../../components/modelCardSelect";
import { SELECTABLE_LANGUAGE_CODES, AUTO_DETECT_CODE, languageLabel, quickPickLanguageCodes } from "../../utils/languageProfiles";
import { closestLanguage, providerCodes, supportedTags } from "../../utils/providerLanguages";
import { detectSourceLanguage, isKnownSourceLanguage, normalizeDetectedCode } from "../../utils/detect";
import { forgetLanguage, readLanguageMemory, rememberLanguage } from "../../utils/languageMemory";
import { preloadLineBreakSegmenter } from "../../lib/subtitle/postprocess/lineWrap";
import { detectedLanguages, requestedSourceLang } from "./sourceLanguage";
import { PROVIDER_STORAGE_KEY } from "./state";
import type { WorkspaceContext } from "./context";

export interface LanguageStepHandle {
  sourceCode(): string;
  targetCode(): string;
  directionLabels(): { source: string; target: string };
  detectFiles(): Promise<void>;
  refreshDetection(): void;
  adoptResolvedSources(): void;
}

function fillSelect(select: HTMLSelectElement, codes: readonly string[], selected: string, includeAuto = false): void {
  const autoOption = includeAuto ? `<option value="${AUTO_DETECT_CODE}">${t("lang.autoDetect")}</option>` : "";
  select.innerHTML = autoOption + codes.map((code) => `<option value="${code}">${languageLabel(code)}</option>`).join("");
  select.value = selected;
}

type LanguageRole = "source" | "target";

function nearestSupported(provider: string, role: LanguageRole, tag: string): string | undefined {
  return closestLanguage(provider, tag, role)?.tag;
}

function pickFallbackTarget(provider: string, preferred: string, excluded: string | undefined): string {
  const supported = supportedTags(provider, "target");
  const candidates = [nearestSupported(provider, "target", preferred), getLocale(), ...quickPickLanguageCodes(getLocale()), ...SELECTABLE_LANGUAGE_CODES];
  return candidates.find((tag): tag is string => Boolean(tag) && supported.has(tag!) && tag !== excluded) ?? SELECTABLE_LANGUAGE_CODES[0];
}

function reconcileStateLanguages(state: WorkspaceContext["state"]): void {
  const source = state.sourceLang === AUTO_DETECT_CODE ? AUTO_DETECT_CODE : nearestSupported(state.provider, "source", state.sourceLang);
  state.sourceLang = source ?? AUTO_DETECT_CODE;
  const target = nearestSupported(state.provider, "target", state.targetLang);
  state.targetLang = target && target !== state.sourceLang ? target : pickFallbackTarget(state.provider, state.targetLang, state.sourceLang === AUTO_DETECT_CODE ? undefined : state.sourceLang);
}

const LOCAL_DETECT_CODE = "__detect_local__";
const TARGET_FEATURED_LIMIT = 6;

export function mountLanguageStep(ctx: WorkspaceContext): LanguageStepHandle {
  const { state, signal } = ctx;
  const providerSelect = ctx.query<HTMLSelectElement>("#provider-select");
  const sourceSelect = ctx.query<HTMLSelectElement>("#source-lang");
  const targetSelect = ctx.query<HTMLSelectElement>("#target-lang");
  const entries = SELECTABLE_LANGUAGE_CODES.map((code) => ({ code }));
  const codesOf = (tag: string) => providerCodes(providerSelect.value, tag);
  let syncingSource = false;

  function localDetectionLabel(): string | undefined {
    const codes = detectedLanguages(state.files);
    if (!codes.length) return undefined;
    return codes.length === 1 ? t("detect.mode.localDone", { language: languageLabel(codes[0]) }) : t("detect.mode.localMixed", { count: codes.length });
  }

  function desiredSourceCode(): string {
    if (state.sourceMode === "forced") return state.sourceLang;
    const codes = detectedLanguages(state.files);
    return state.sourceMode === "local" && codes.length === 1 && state.files.every((file) => file.detectedLang) ? codes[0] : AUTO_DETECT_CODE;
  }

  reconcileStateLanguages(state);
  fillSelect(sourceSelect, SELECTABLE_LANGUAGE_CODES, desiredSourceCode(), true);
  fillSelect(targetSelect, SELECTABLE_LANGUAGE_CODES, state.targetLang);
  providerSelect.value = state.provider;

  const sourceCombo = mountLanguageSelect({
    select: sourceSelect,
    container: ctx.query("#source-lang-combo"),
    entries,
    codesOf,
    featured: () => [
      {
        code: LOCAL_DETECT_CODE,
        label: localDetectionLabel() ?? t("detect.mode.local"),
        selected: state.sourceMode === "local" && localDetectionLabel() !== undefined,
        onSelect: () => { void selectLocalDetection(); },
      },
      { code: AUTO_DETECT_CODE, label: t("detect.mode.cloud"), selected: state.sourceMode === "cloud" },
    ],
    featuredLabel: t("languageSelect.detection"),
    triggerLabel: () => (state.sourceMode === "local" ? localDetectionLabel() : undefined),
    excludeCode: () => targetSelect.value,
    supportedCodes: () => supportedTags(providerSelect.value, "source"),
    searchPlaceholder: t("lang.searchPlaceholder"),
    ariaLabelledBy: "source-lang-label",
    signal,
  });
  const targetCombo = mountLanguageSelect({
    select: targetSelect,
    container: ctx.query("#target-lang-combo"),
    entries,
    codesOf,
    featured: () => quickPickLanguageCodes(getLocale()).map((code) => ({ code })),
    featuredLabel: t("languageSelect.suggested"),
    featuredLimit: TARGET_FEATURED_LIMIT,
    recent: () => readLanguageMemory().map((code) => ({ code })),
    recentLabel: t("languageSelect.recent"),
    onPick: rememberLanguage,
    onForget: forgetLanguage,
    excludeCode: () => (sourceSelect.value === AUTO_DETECT_CODE ? undefined : sourceSelect.value),
    supportedCodes: () => supportedTags(providerSelect.value, "target"),
    searchPlaceholder: t("lang.searchPlaceholder"),
    ariaLabelledBy: "target-lang-label",
    signal,
  });

  function syncSourceSelect(): void {
    const code = desiredSourceCode();
    if (code !== sourceSelect.value) {
      syncingSource = true;
      sourceCombo.setValue(code);
      syncingSource = false;
    }
    sourceCombo.refresh();
  }

  async function detectFiles(): Promise<void> {
    const pending = state.files.filter((file) => file.detectedLang === undefined && !file.parseError);
    await Promise.all(pending.map(async (file) => {
      const detected = await detectSourceLanguage(file.cues);
      file.detectedLang = detected?.reliable && isKnownSourceLanguage(detected.code) ? normalizeDetectedCode(detected.code) : null;
    }));
    syncSourceSelect();
    const [only, ...others] = detectedLanguages(state.files);
    if (only && !others.length) ctx.announce(t("a11y.sourceDetected", { language: languageLabel(only) }));
    ctx.flow.languageDetected();
  }

  async function selectLocalDetection(): Promise<void> {
    state.sourceMode = "local";
    await detectFiles();
  }

  function adoptResolvedSources(): void {
    for (const file of state.files) {
      const resolved = file.jobResult?.resolved_source_lang;
      if (resolved && requestedSourceLang(state, file) === AUTO_DETECT_CODE) file.detectedLang = resolved;
    }
    if (state.sourceMode === "cloud") state.sourceMode = "local";
    syncSourceSelect();
    ctx.flow.languageDetected();
  }

  mountModelCardSelect(ctx.root, providerSelect, ctx.signal);
  mountModelMore(ctx.root);
  function reconcileWithProvider(): void {
    const provider = providerSelect.value;
    if (state.sourceMode === "forced" && sourceSelect.value !== AUTO_DETECT_CODE) {
      const source = nearestSupported(provider, "source", sourceSelect.value) ?? AUTO_DETECT_CODE;
      if (source !== sourceSelect.value) sourceCombo.setValue(source);
    }
    const excluded = sourceSelect.value === AUTO_DETECT_CODE ? undefined : sourceSelect.value;
    const target = nearestSupported(provider, "target", targetSelect.value);
    if (target === targetSelect.value) return;
    const userPicked = state.userPickedTargetLang;
    const next = target && target !== excluded ? target : pickFallbackTarget(provider, targetSelect.value, excluded);
    targetCombo.setValue(next);
    state.userPickedTargetLang = userPicked;
    ctx.announce(t("a11y.targetChanged", { language: languageLabel(next) }));
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
    if (isLocaleCode(targetSelect.value)) void loadLocale(targetSelect.value);
    if (sourceSelect.value !== AUTO_DETECT_CODE && sourceSelect.value === targetSelect.value) {
      state.sourceMode = "local";
      ctx.announce(t("a11y.sourceReset"));
      syncSourceSelect();
    }
    ctx.flow.languageChanged();
  }, { signal });

  sourceSelect.addEventListener("change", () => {
    state.sourceLang = sourceSelect.value;
    const autoDetect = sourceSelect.value === AUTO_DETECT_CODE;
    if (!syncingSource) state.sourceMode = autoDetect ? "cloud" : "forced";
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
    detectFiles,
    refreshDetection: () => {
      syncSourceSelect();
      ctx.flow.languageDetected();
    },
    adoptResolvedSources,
  };
}
