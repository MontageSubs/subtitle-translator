import { tabStorage } from "../../utils/safeStorage";
import { getLocale, type LocaleCode } from "../../i18n";
import type { RejectedArchive } from "../../lib/subtitle/archive";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { consumeHistoryRestore } from "../../lib/history/historyRestore";
import type { HistoryCue, HistoryJob, HistorySubtitle } from "../../lib/history/history";
import { historyCuesToCues, historyCuesToTopAlignOverrides, historySubtitleToJobResult } from "../../lib/history/historyRender";
import { restoreSourceFile } from "../../lib/history/sourceLayout";
import { glossaryToEntries } from "../../utils/dictionary";
import { SCENE_SECONDS_MAX, SCENE_SECONDS_MIN } from "../../components/sceneSplitField";
import { createId } from "../../utils/id";
import { DEFAULT_CREDIT_ENABLED } from "../../lib/subtitle/formats/credit";
import { createSubtitleFile, WorkspaceState, SubtitleFile } from "./state";
import { ASS_SIZE_MAX, ASS_SIZE_MIN } from "../../render/translator/settingFields";
import { createFileFromSource, parseSourceText } from "./sourceFile";

const LOCALE_SWITCH_DRAFT_KEY = "subtitle-translator:locale-switch-draft";

type DraftFile = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat" | "originFormat"> & { rawSourceText: string };

type DraftSettings = Pick<WorkspaceState,
  "outputFormat" | "sourceLang" | "userPickedSourceLang" | "targetLang" | "outputMode" | "stackingOrder" | "userPickedOutputMode" | "cueLayout" |
  "musicTopAlign" | "userPickedMusicTopAlign" | "creditEnabled" | "sdhEnabled" | "caseSensitiveTerms" | "skipLyrics" | "fullWidthPunctuation" |
  "keepTerminalPunctuation" | "sceneSeconds" | "assFontPreset" | "assEqualBilingualSize" | "assCustomPrimarySize" | "assCustomSecondarySize" |
  "contextText" | "glossaryEntries">;

interface LocaleSwitchDraft {
  locale: LocaleCode;
  files: DraftFile[];
  rejectedArchives?: RejectedArchive[];
  settings?: Partial<DraftSettings>;
}

const isTruthyString = (value: unknown) => typeof value === "string" && value.length > 0;
const isBoolean = (value: unknown) => typeof value === "boolean";
const isString = (value: unknown) => typeof value === "string";
const isOneOf = (...allowed: string[]) => (value: unknown) => typeof value === "string" && allowed.includes(value);
const isNumberBetween = (min: number, max: number) => (value: unknown) => typeof value === "number" && value >= min && value <= max;
const isGlossary = (value: unknown) => Array.isArray(value) && value.every((entry) => isString(entry?.source) && isString(entry?.target));

const SETTING_VALIDATORS: { [Key in keyof DraftSettings]: (value: unknown) => boolean } = {
  outputFormat: isOneOf("srt", "vtt", "ass"),
  sourceLang: isTruthyString,
  userPickedSourceLang: isBoolean,
  targetLang: isTruthyString,
  outputMode: isOneOf("monolingual", "bilingual"),
  stackingOrder: isOneOf("translation_top", "original_top"),
  userPickedOutputMode: isBoolean,
  cueLayout: isOneOf("single", "split"),
  musicTopAlign: isBoolean,
  userPickedMusicTopAlign: isBoolean,
  creditEnabled: isBoolean,
  sdhEnabled: isBoolean,
  caseSensitiveTerms: isBoolean,
  skipLyrics: isBoolean,
  fullWidthPunctuation: isBoolean,
  keepTerminalPunctuation: isBoolean,
  sceneSeconds: isNumberBetween(SCENE_SECONDS_MIN, SCENE_SECONDS_MAX),
  assFontPreset: isOneOf("desktop", "mobile", "custom"),
  assEqualBilingualSize: isBoolean,
  assCustomPrimarySize: isNumberBetween(ASS_SIZE_MIN, ASS_SIZE_MAX),
  assCustomSecondarySize: isNumberBetween(ASS_SIZE_MIN, ASS_SIZE_MAX),
  contextText: isString,
  glossaryEntries: isGlossary,
};

const SETTING_KEYS = Object.keys(SETTING_VALIDATORS) as (keyof DraftSettings)[];

function matchesHistory(file: SubtitleFile, cues: HistoryCue[]): boolean {
  if (file.parseError) return false;
  const parsedById = new Map(file.cues.map((cue) => [cue.id, cue]));
  return cues.every((cue) => {
    const parsed = parsedById.get(cue.id);
    return parsed?.start_ms === cue.start_ms && parsed.end_ms === cue.end_ms;
  });
}

function restoreHistoryFile(state: WorkspaceState, job: HistoryJob, subtitle: HistorySubtitle): SubtitleFile {
  const restored = restoreSourceFile(subtitle);
  const filename = subtitle.sourceFilename || job.sourceFilename || subtitle.filename || "original.srt";
  const relativePath = subtitle.relativePath || filename;
  const parsed = restored ? createFileFromSource(state, { name: filename, relativePath, bytes: restored.bytes }) : null;
  const source = parsed && matchesHistory(parsed, subtitle.cues)
    ? parsed
    : createSubtitleFile(state, {
      filename,
      relativePath,
      sourceFormat: subtitle.sourceFormat || null,
      originFormat: subtitle.originFormat ?? subtitle.format,
      rawSourceText: restored?.text,
      rawSourceBytes: restored?.bytes,
      cues: historyCuesToCues(subtitle.cues),
    });
  return {
    ...source,
    id: subtitle.id || createId(),
    jobResult: historySubtitleToJobResult(job, subtitle),
    renderMode: subtitle.outputMode,
    stacking: subtitle.stacking,
    musicTopAlign: subtitle.musicTopAlign ?? targetRulesFor(job.targetLang).alignsMusicToTop,
    creditEnabled: subtitle.credit ?? DEFAULT_CREDIT_ENABLED,
    topAlignOverrides: historyCuesToTopAlignOverrides(subtitle.cues),
  };
}

export function hydrateFromHistory(state: WorkspaceState): boolean {
  const job = consumeHistoryRestore("nmt");
  if (!job) return false;

  state.files = job.subtitles.map((subtitle) => restoreHistoryFile(state, job, subtitle));
  state.rejectedArchives = [];
  state.outputFormat = job.subtitles[0]?.format ?? state.outputFormat;
  state.currentHistoryId = job.id;
  state.elapsedMs = job.elapsedMs ?? null;
  state.sourceLang = job.sourceLang;
  state.targetLang = job.targetLang;
  state.userPickedTargetLang = true;
  const [first] = state.files;
  if (first) {
    state.outputMode = first.renderMode;
    state.stackingOrder = first.stacking;
    state.userPickedOutputMode = true;
    state.cueLayout = job.subtitles[0].cueLayout ?? "single";
    state.musicTopAlign = first.musicTopAlign;
    state.userPickedMusicTopAlign = true;
    state.creditEnabled = first.creditEnabled;
  }
  state.glossaryEntries = job.glossary ? glossaryToEntries(job.glossary) : [];
  if (job.contextText !== undefined) state.contextText = job.contextText;
  if (job.caseSensitiveTerms !== undefined) state.caseSensitiveTerms = job.caseSensitiveTerms;
  if (job.stripSdh !== undefined) state.sdhEnabled = job.stripSdh;
  state.skipLyrics = job.skipLyrics ?? false;
  state.fullWidthPunctuation = job.fullWidthPunctuation ?? false;
  state.keepTerminalPunctuation = job.keepTerminalPunctuation ?? false;
  if (job.sceneSeconds !== undefined) state.sceneSeconds = job.sceneSeconds;
  return true;
}

function hasWorkToKeep(state: WorkspaceState): boolean {
  return state.files.length > 0 || state.rejectedArchives.length > 0 || state.contextText.trim().length > 0 || state.glossaryEntries.length > 0;
}

export function saveLocaleSwitchDraft(state: WorkspaceState, locale: LocaleCode): boolean {
  if (!hasWorkToKeep(state)) return false;
  const draft: LocaleSwitchDraft = {
    locale,
    files: state.files.flatMap(({ filename, relativePath, sourceFormat, originFormat, rawSourceText }) =>
      rawSourceText === undefined ? [] : [{ filename, relativePath, sourceFormat, originFormat, rawSourceText }]),
    rejectedArchives: state.rejectedArchives,
    settings: Object.fromEntries(SETTING_KEYS.map((key) => [key, state[key]])),
  };
  tabStorage.writeJson(LOCALE_SWITCH_DRAFT_KEY, draft);
  return true;
}

function takeLocaleSwitchDraft(): LocaleSwitchDraft | null {
  const draft = tabStorage.readJson<LocaleSwitchDraft>(LOCALE_SWITCH_DRAFT_KEY);
  tabStorage.removeItem(LOCALE_SWITCH_DRAFT_KEY);
  return draft?.locale === getLocale() && Array.isArray(draft.files) ? draft : null;
}

function restoreSettings(state: WorkspaceState, settings: Partial<DraftSettings> = {}): void {
  for (const key of SETTING_KEYS) {
    if (SETTING_VALIDATORS[key](settings[key])) Object.assign(state, { [key]: settings[key] });
  }
  if (SETTING_VALIDATORS.targetLang(settings.targetLang)) state.userPickedTargetLang = true;
  state.creditPreferred = state.creditEnabled;
}

export function hydrateFromLocaleSwitch(state: WorkspaceState): boolean {
  const draft = takeLocaleSwitchDraft();
  if (!draft) return false;

  state.files = draft.files.map((file) => createSubtitleFile(state, { ...file, ...parseSourceText(file.rawSourceText, file.originFormat) }));
  state.rejectedArchives = Array.isArray(draft.rejectedArchives) ? draft.rejectedArchives : [];
  restoreSettings(state, draft.settings);
  state.files.forEach((file) => {
    file.renderMode = state.outputMode;
    file.stacking = state.stackingOrder;
    file.musicTopAlign = state.musicTopAlign;
    file.creditEnabled = state.creditEnabled;
  });
  return true;
}
