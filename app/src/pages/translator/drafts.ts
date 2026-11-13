import { STORAGE_KEYS } from "../../config/storage";
import { tabStorage } from "../../utils/safeStorage";
import { getLocale, type LocaleCode } from "../../i18n";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { consumeHistoryRestore } from "../../lib/history/historyRestore";
import type { HistoryCue, HistoryJob, HistorySubtitle } from "../../lib/history/history";
import { historyCuesToCues, historyCuesToTopAlignOverrides, historySubtitleToJobResult } from "../../lib/history/historyRender";
import { restoreSourceFile } from "../../lib/history/sourceLayout";
import { glossaryToEntries, type GlossaryEntry } from "../../utils/glossary";
import { createId } from "../../utils/id";
import { packGroup, unpackGroup } from "../../lib/subtitle/variants/groupCodec";
import { variantOfChoice } from "../../lib/subtitle/variants/variantSource";
import { DEFAULT_CREDIT_ENABLED } from "../../lib/subtitle/formats/credit";
import { createSubtitleFile, WorkspaceState, SubtitleFile } from "./state";
import { createFileFromSource, createFileFromText } from "./sourceFile";
import { assistFor, bufferOf } from "./assistScope";
import { translationSignature } from "./translationSignature";


interface DraftAssist {
  glossaryEntries: GlossaryEntry[];
  contextText: string;
}

interface DraftChoice {
  packedGroup: string;
  variantId: string;
}

type DraftFile = Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat"> & { rawSourceText: string; assist?: DraftAssist; choice?: DraftChoice };

interface LocaleSwitchDraft {
  locale: LocaleCode;
  files: DraftFile[];
  contextText: string;
  glossaryEntries: GlossaryEntry[];
  perSubtitle: boolean;
}

const isText = (value: unknown): value is string => typeof value === "string";
const isGlossaryEntry = (entry: Partial<GlossaryEntry> | null): entry is GlossaryEntry => isText(entry?.source) && isText(entry.target);
const isDraftAssist = (assist: Partial<DraftAssist> | undefined): assist is DraftAssist => isText(assist?.contextText) && Array.isArray(assist.glossaryEntries) && assist.glossaryEntries.every(isGlossaryEntry);
const isDraftChoice = (choice: Partial<DraftChoice> | undefined): choice is DraftChoice => isText(choice?.variantId) && isText(choice.packedGroup);
const isDraftFile = (file: Partial<DraftFile> | null): file is DraftFile => isText(file?.filename) && isText(file.relativePath) && isText(file.rawSourceText);

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
    detectedLang: subtitle.sourceLang ?? (subtitle.incomplete ? null : job.sourceLang),
    jobResult: subtitle.incomplete ? null : historySubtitleToJobResult(job, subtitle),
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
  state.rejectedInputs = [];
  state.outputFormat = job.subtitles[0]?.format ?? state.outputFormat;
  state.currentHistoryId = job.id;
  state.historyIncomplete = job.incomplete === true;
  state.elapsedMs = job.elapsedMs ?? null;
  state.sourceMode = "local";
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
  state.assistPerSubtitle = false;
  state.assistFileId = null;
  state.assistByFile = new Map();
  state.glossaryEntries = job.glossary ? glossaryToEntries(job.glossary) : [];
  if (job.contextText !== undefined) state.contextText = job.contextText;
  if (job.caseSensitiveTerms !== undefined) state.caseSensitiveTerms = job.caseSensitiveTerms;
  if (job.stripSdh !== undefined) state.sdhEnabled = job.stripSdh;
  state.skipLyrics = job.skipLyrics ?? false;
  state.fullWidthPunctuation = job.fullWidthPunctuation ?? false;
  state.keepTerminalPunctuation = job.keepTerminalPunctuation ?? false;
  state.stripInlineStyling = job.stripInlineStyling ?? false;
  if (job.sceneSeconds !== undefined) state.sceneSeconds = job.sceneSeconds;
  state.files.filter((file) => file.jobResult).forEach((file) => { file.translationSignature = translationSignature(state, file); });
  return true;
}

async function draftChoiceOf(file: SubtitleFile): Promise<DraftChoice | undefined> {
  if (!file.choice || file.choice.group.variants.length < 2) return undefined;
  return { packedGroup: await packGroup(file.choice.group), variantId: file.choice.variantId };
}

async function buildLocaleSwitchDraft(state: WorkspaceState, locale: LocaleCode, withChoices: boolean): Promise<LocaleSwitchDraft | null> {
  const files: DraftFile[] = [];
  for (const file of state.files) {
    if (file.rawSourceText === undefined) continue;
    const choice = withChoices ? await draftChoiceOf(file) : undefined;
    files.push({ filename: file.filename, relativePath: file.relativePath, sourceFormat: file.sourceFormat, rawSourceText: file.rawSourceText, ...(choice && { choice }), ...(state.assistPerSubtitle && { assist: assistFor(state, file) }) });
  }
  if (!files.length && !state.contextText.trim() && !state.glossaryEntries.length) return null;
  return { locale, files, contextText: state.contextText, glossaryEntries: state.glossaryEntries, perSubtitle: state.assistPerSubtitle };
}

export const hasPackableChoices = (state: WorkspaceState): boolean => state.files.some((file) => (file.choice?.group.variants.length ?? 0) > 1);

export async function saveLocaleSwitchDraft(state: WorkspaceState, locale: LocaleCode): Promise<boolean> {
  if (state.files.some((file) => file.jobResult)) return false;
  for (const withChoices of hasPackableChoices(state) ? [true, false] : [false]) {
    const draft = await buildLocaleSwitchDraft(state, locale, withChoices);
    if (!draft) return false;
    if (tabStorage.tryWriteJson(STORAGE_KEYS.localeSwitchDraft, draft)) return true;
  }
  return false;
}

function takeLocaleSwitchDraft(): LocaleSwitchDraft | null {
  const draft = tabStorage.readJson<Partial<LocaleSwitchDraft>>(STORAGE_KEYS.localeSwitchDraft);
  tabStorage.removeItem(STORAGE_KEYS.localeSwitchDraft);
  if (draft?.locale !== getLocale() || !Array.isArray(draft.files)) return null;
  return {
    locale: draft.locale,
    files: draft.files.filter(isDraftFile).map((file) => ({ ...file, assist: isDraftAssist(file.assist) ? file.assist : undefined, choice: isDraftChoice(file.choice) ? file.choice : undefined })),
    perSubtitle: draft.perSubtitle === true,
    contextText: isText(draft.contextText) ? draft.contextText : "",
    glossaryEntries: Array.isArray(draft.glossaryEntries) ? draft.glossaryEntries.filter(isGlossaryEntry) : [],
  };
}

const pendingChoices = new Map<string, DraftChoice>();

export async function restoreLocaleSwitchChoices(state: WorkspaceState): Promise<boolean> {
  const entries = [...pendingChoices];
  pendingChoices.clear();
  let restored = false;
  for (const [fileId, { packedGroup, variantId }] of entries) {
    const file = state.files.find(({ id }) => id === fileId);
    if (!file || file.choice) continue;
    try {
      const choice = { group: await unpackGroup(packedGroup), variantId };
      if (!variantOfChoice(choice)) continue;
      file.choice = choice;
      restored = true;
    } catch (error) {
      console.warn("[subtitle-translator] Restoring the language choices failed", error);
    }
  }
  return restored;
}

export function hydrateFromLocaleSwitch(state: WorkspaceState): boolean {
  const draft = takeLocaleSwitchDraft();
  if (!draft) return false;
  pendingChoices.clear();
  state.files = draft.files.map(({ choice, ...file }) => {
    const created = createFileFromText(state, file);
    if (choice) pendingChoices.set(created.id, choice);
    return created;
  });
  state.contextText = draft.contextText;
  state.glossaryEntries = draft.glossaryEntries;
  const assists = draft.files.map((file) => file.assist);
  if (draft.perSubtitle && state.files.length > 1 && assists.every(Boolean)) {
    state.assistPerSubtitle = true;
    state.assistFileId = state.files[0].id;
    state.assistByFile = new Map(state.files.map(({ id }, index) => [id, { glossary: bufferOf(assists[index]!.glossaryEntries), contextText: assists[index]!.contextText }]));
    state.glossaryEntries = assists[0]!.glossaryEntries;
    state.contextText = assists[0]!.contextText;
  }
  return true;
}
