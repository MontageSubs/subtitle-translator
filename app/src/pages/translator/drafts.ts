import { tabStorage } from "../../utils/safeStorage";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { consumeHistoryRestore } from "../../lib/history/historyRestore";
import { historyCuesToCues, historyCuesToTopAlignOverrides } from "../../lib/history/historyRender";
import { glossaryToEntries } from "../../utils/dictionary";
import { SCENE_SECONDS_MAX, SCENE_SECONDS_MIN } from "../../components/sceneSplitField";
import { createId } from "../../utils/id";
import { defaultOutputFormatFor, createSubtitleFile, WorkspaceState, SubtitleFile } from "./state";

const LOCALE_SWITCH_DRAFT_KEY = "subtitle-translator:locale-switch-draft";

type DraftFile = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat" | "originFormat" | "cues" | "rawSourceText">;

type DraftSettings = Pick<WorkspaceState,
  "outputFormat" | "sourceLang" | "targetLang" | "outputMode" | "stackingOrder" | "userPickedOutputMode" | "musicTopAlign" |
  "userPickedMusicTopAlign" | "sdhEnabled" | "caseSensitiveTerms" | "sceneSeconds" | "contextText" | "glossaryEntries">;

interface LocaleSwitchDraft extends Partial<DraftSettings> {
  files: DraftFile[];
}

export function hydrateFromHistory(state: WorkspaceState): boolean {
  const job = consumeHistoryRestore("nmt");
  if (!job) return false;

  state.files = job.subtitles.map((subtitle) => {
    const filename = subtitle.filename || subtitle.sourceFilename || job.title || "original.srt";
    return createSubtitleFile(state, {
      id: subtitle.id || createId(),
      filename,
      relativePath: subtitle.relativePath || subtitle.sourceFilename || filename,
      sourceFormat: subtitle.sourceFormat || null,
      originFormat: subtitle.format,
      cues: historyCuesToCues(subtitle.cues),
      renderMode: subtitle.outputMode,
      stacking: subtitle.stacking,
      musicTopAlign: subtitle.musicTopAlign ?? targetRulesFor(job.targetLang).alignsMusicToTop,
      topAlignOverrides: historyCuesToTopAlignOverrides(subtitle.cues),
    });
  });
  state.outputFormat = defaultOutputFormatFor(state.files);
  state.currentHistoryId = null;
  state.sourceLang = job.sourceLang;
  state.targetLang = job.targetLang;
  state.userPickedTargetLang = true;
  const [first] = state.files;
  if (first) {
    state.outputMode = first.renderMode;
    state.stackingOrder = first.stacking;
    state.userPickedOutputMode = true;
    state.musicTopAlign = first.musicTopAlign;
    state.userPickedMusicTopAlign = true;
  }
  state.glossaryEntries = job.glossary ? glossaryToEntries(job.glossary) : [];
  if (job.contextText !== undefined) state.contextText = job.contextText;
  if (job.caseSensitiveTerms !== undefined) state.caseSensitiveTerms = job.caseSensitiveTerms;
  if (job.stripSdh !== undefined) state.sdhEnabled = job.stripSdh;
  if (job.sceneSeconds !== undefined) state.sceneSeconds = job.sceneSeconds;
  return true;
}

export function saveLocaleSwitchDraft(state: WorkspaceState): void {
  if (!state.files.length || state.files.some((file) => file.jobResult)) return;
  const draft: LocaleSwitchDraft = {
    files: state.files.map(({ filename, relativePath, sourceFormat, originFormat, cues, rawSourceText }) => ({ filename, relativePath, sourceFormat, originFormat, cues, rawSourceText })),
    outputFormat: state.outputFormat,
    sourceLang: state.sourceLang,
    targetLang: state.targetLang,
    outputMode: state.outputMode,
    stackingOrder: state.stackingOrder,
    userPickedOutputMode: state.userPickedOutputMode,
    musicTopAlign: state.musicTopAlign,
    userPickedMusicTopAlign: state.userPickedMusicTopAlign,
    sdhEnabled: state.sdhEnabled,
    caseSensitiveTerms: state.caseSensitiveTerms,
    sceneSeconds: state.sceneSeconds,
    contextText: state.contextText,
    glossaryEntries: state.glossaryEntries,
  };
  tabStorage.writeJson(LOCALE_SWITCH_DRAFT_KEY, draft);
}

function takeLocaleSwitchDraft(): LocaleSwitchDraft | null {
  const draft = tabStorage.readJson<LocaleSwitchDraft>(LOCALE_SWITCH_DRAFT_KEY);
  tabStorage.removeItem(LOCALE_SWITCH_DRAFT_KEY);
  return Array.isArray(draft?.files) && draft.files.length ? draft : null;
}

function assignDefined<K extends keyof DraftSettings>(state: WorkspaceState, draft: LocaleSwitchDraft, key: K, isValid: (value: unknown) => boolean): void {
  const value = draft[key];
  if (isValid(value)) state[key] = value as WorkspaceState[K];
}

const isTruthyString = (value: unknown) => typeof value === "string" && value.length > 0;
const isBoolean = (value: unknown) => typeof value === "boolean";
const isString = (value: unknown) => typeof value === "string";
const isArray = (value: unknown) => Array.isArray(value);
const isOneOf = (...allowed: string[]) => (value: unknown) => typeof value === "string" && allowed.includes(value);
const isSceneSeconds = (value: unknown) => typeof value === "number" && value >= SCENE_SECONDS_MIN && value <= SCENE_SECONDS_MAX;

export function hydrateFromLocaleSwitch(state: WorkspaceState): boolean {
  const draft = takeLocaleSwitchDraft();
  if (!draft) return false;

  state.files = draft.files.map((file) => createSubtitleFile(state, file));
  assignDefined(state, draft, "outputFormat", isOneOf("srt", "vtt", "ass"));
  assignDefined(state, draft, "sourceLang", isTruthyString);
  if (isTruthyString(draft.targetLang)) {
    state.targetLang = draft.targetLang!;
    state.userPickedTargetLang = true;
  }
  assignDefined(state, draft, "outputMode", isOneOf("monolingual", "bilingual"));
  assignDefined(state, draft, "stackingOrder", isOneOf("translation_top", "original_top"));
  assignDefined(state, draft, "userPickedOutputMode", isBoolean);
  assignDefined(state, draft, "musicTopAlign", isBoolean);
  assignDefined(state, draft, "userPickedMusicTopAlign", isBoolean);
  assignDefined(state, draft, "sdhEnabled", isBoolean);
  assignDefined(state, draft, "caseSensitiveTerms", isBoolean);
  assignDefined(state, draft, "sceneSeconds", isSceneSeconds);
  assignDefined(state, draft, "contextText", isString);
  assignDefined(state, draft, "glossaryEntries", isArray);
  state.files.forEach((file) => {
    file.renderMode = state.outputMode;
    file.stacking = state.stackingOrder;
    file.musicTopAlign = state.musicTopAlign;
  });
  return true;
}
