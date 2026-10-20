import { tabStorage } from "../../utils/safeStorage";
import { getLocale, type LocaleCode } from "../../i18n";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { consumeHistoryRestore } from "../../lib/history/historyRestore";
import type { HistoryCue, HistoryJob, HistorySubtitle } from "../../lib/history/history";
import { historyCuesToCues, historyCuesToTopAlignOverrides, historySubtitleToJobResult } from "../../lib/history/historyRender";
import { restoreSourceFile } from "../../lib/history/sourceLayout";
import { glossaryToEntries, type DictionaryEntry } from "../../utils/dictionary";
import { createId } from "../../utils/id";
import { DEFAULT_CREDIT_ENABLED } from "../../lib/subtitle/formats/credit";
import { createSubtitleFile, WorkspaceState, SubtitleFile } from "./state";
import { createFileFromSource, createFileFromText } from "./sourceFile";

const LOCALE_SWITCH_DRAFT_KEY = "subtitle-translator:locale-switch-draft";

type DraftFile = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat"> & { rawSourceText: string };

interface LocaleSwitchDraft {
  locale: LocaleCode;
  files: DraftFile[];
  contextText: string;
  glossaryEntries: DictionaryEntry[];
}

const isText = (value: unknown): value is string => typeof value === "string";
const isDraftFile = (file: Partial<DraftFile> | null): file is DraftFile => isText(file?.filename) && isText(file.relativePath) && isText(file.rawSourceText);
const isDictionaryEntry = (entry: Partial<DictionaryEntry> | null): entry is DictionaryEntry => isText(entry?.source) && isText(entry.target);

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
  const filename = subtitle.sourceFilename || subtitle.filename || "original.srt";
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

export function saveLocaleSwitchDraft(state: WorkspaceState, locale: LocaleCode): boolean {
  if (state.files.some((file) => file.jobResult)) return false;
  const files = state.files.flatMap(({ filename, relativePath, sourceFormat, rawSourceText }) =>
    rawSourceText === undefined ? [] : [{ filename, relativePath, sourceFormat, rawSourceText }]);
  if (!files.length && !state.contextText.trim() && !state.glossaryEntries.length) return false;
  const draft: LocaleSwitchDraft = { locale, files, contextText: state.contextText, glossaryEntries: state.glossaryEntries };
  tabStorage.writeJson(LOCALE_SWITCH_DRAFT_KEY, draft);
  return true;
}

function takeLocaleSwitchDraft(): LocaleSwitchDraft | null {
  const draft = tabStorage.readJson<Partial<LocaleSwitchDraft>>(LOCALE_SWITCH_DRAFT_KEY);
  tabStorage.removeItem(LOCALE_SWITCH_DRAFT_KEY);
  if (draft?.locale !== getLocale() || !Array.isArray(draft.files)) return null;
  return {
    locale: draft.locale,
    files: draft.files.filter(isDraftFile),
    contextText: isText(draft.contextText) ? draft.contextText : "",
    glossaryEntries: Array.isArray(draft.glossaryEntries) ? draft.glossaryEntries.filter(isDictionaryEntry) : [],
  };
}

export function hydrateFromLocaleSwitch(state: WorkspaceState): boolean {
  const draft = takeLocaleSwitchDraft();
  if (!draft) return false;
  state.files = draft.files.map((file) => createFileFromText(state, file));
  state.contextText = draft.contextText;
  state.glossaryEntries = draft.glossaryEntries;
  return true;
}
