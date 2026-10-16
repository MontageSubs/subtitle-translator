import { tabStorage } from "../../utils/safeStorage";
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
import { createFileFromSource } from "./sourceFile";

const LOCALE_SWITCH_DRAFT_KEY = "subtitle-translator:locale-switch-draft";

type DraftFile = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat" | "originFormat" | "cues" | "rawSourceText" | "parseError" | "parseErrorReason">;

type DraftSettings = Pick<WorkspaceState,
  "outputFormat" | "sourceLang" | "targetLang" | "outputMode" | "stackingOrder" | "userPickedOutputMode" | "musicTopAlign" |
  "userPickedMusicTopAlign" | "creditEnabled" | "sdhEnabled" | "caseSensitiveTerms" | "skipLyrics" | "fullWidthPunctuation" | "keepTerminalPunctuation" | "sceneSeconds" | "contextText" | "glossaryEntries">;

interface LocaleSwitchDraft extends Partial<DraftSettings> {
  files: DraftFile[];
  rejectedArchives?: string[];
}

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

export function saveLocaleSwitchDraft(state: WorkspaceState): void {
  if (!state.files.length && !state.rejectedArchives.length) return;
  if (state.files.some((file) => file.jobResult)) return;
  const draft: LocaleSwitchDraft = {
    files: state.files.map(({ filename, relativePath, sourceFormat, originFormat, cues, rawSourceText, parseError, parseErrorReason }) => ({ filename, relativePath, sourceFormat, originFormat, cues, rawSourceText, parseError, parseErrorReason })),
    rejectedArchives: state.rejectedArchives,
    outputFormat: state.outputFormat,
    sourceLang: state.sourceLang,
    targetLang: state.targetLang,
    outputMode: state.outputMode,
    stackingOrder: state.stackingOrder,
    userPickedOutputMode: state.userPickedOutputMode,
    musicTopAlign: state.musicTopAlign,
    userPickedMusicTopAlign: state.userPickedMusicTopAlign,
    creditEnabled: state.creditEnabled,
    sdhEnabled: state.sdhEnabled,
    caseSensitiveTerms: state.caseSensitiveTerms,
    skipLyrics: state.skipLyrics,
    fullWidthPunctuation: state.fullWidthPunctuation,
    keepTerminalPunctuation: state.keepTerminalPunctuation,
    sceneSeconds: state.sceneSeconds,
    contextText: state.contextText,
    glossaryEntries: state.glossaryEntries,
  };
  tabStorage.writeJson(LOCALE_SWITCH_DRAFT_KEY, draft);
}

function takeLocaleSwitchDraft(): LocaleSwitchDraft | null {
  const draft = tabStorage.readJson<LocaleSwitchDraft>(LOCALE_SWITCH_DRAFT_KEY);
  tabStorage.removeItem(LOCALE_SWITCH_DRAFT_KEY);
  return Array.isArray(draft?.files) && (draft.files.length > 0 || Boolean(draft.rejectedArchives?.length)) ? draft : null;
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
  state.rejectedArchives = Array.isArray(draft.rejectedArchives) ? draft.rejectedArchives : [];
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
  assignDefined(state, draft, "creditEnabled", isBoolean);
  state.creditPreferred = state.creditEnabled;
  assignDefined(state, draft, "sdhEnabled", isBoolean);
  assignDefined(state, draft, "caseSensitiveTerms", isBoolean);
  assignDefined(state, draft, "skipLyrics", isBoolean);
  assignDefined(state, draft, "fullWidthPunctuation", isBoolean);
  assignDefined(state, draft, "keepTerminalPunctuation", isBoolean);
  assignDefined(state, draft, "sceneSeconds", isSceneSeconds);
  assignDefined(state, draft, "contextText", isString);
  assignDefined(state, draft, "glossaryEntries", isArray);
  state.files.forEach((file) => {
    file.renderMode = state.outputMode;
    file.stacking = state.stackingOrder;
    file.musicTopAlign = state.musicTopAlign;
    file.creditEnabled = state.creditEnabled;
  });
  return true;
}
