import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { DEFAULT_SCENE_CHANGE_SECONDS } from "../../lib/subtitle/common/sceneThreads";
import { AssFontPreset } from "../../lib/subtitle/formats/ass/template";
import { AnCornerOrDefault } from "../../lib/subtitle/formats/topAlign";
import { DEFAULT_CREDIT_ENABLED } from "../../lib/subtitle/formats/credit";
import { AUTO_DETECT_CODE, SELECTABLE_LANGUAGE_CODES, quickPickLanguageCodes } from "../../utils/languageProfiles";
import { readLanguageMemory } from "../../utils/languageMemory";
import { languageName } from "../../utils/languageNames";
import { supportedTags } from "../../utils/providerLanguages";
import { Cue, OutputMode, BilingualStacking, CueLayout, SubtitleFormat } from "../../lib/subtitle/types";
import { SourceFormat } from "../../lib/subtitle/extraction/encoding";
import type { RejectedArchive } from "../../lib/subtitle/archive";
import { TranslateJobResponse } from "../../api/translation";
import { DictionaryEntry } from "../../utils/dictionary";
import type { GlossaryBuffer } from "../../components/glossaryEditor";
import { getLocale, t } from "../../i18n";
import { createId } from "../../utils/id";

const SELECTABLE_PROVIDERS = ["google-nmt-pa", "microsoft-nmt-edge"];

export type ParseErrorReason = "invalidFormat" | "noCues";

type SourceMode = "local" | "cloud" | "forced";

export interface SubtitleFile {
  id: string;
  filename: string;
  relativePath: string;
  sourceFormat: SourceFormat | null;
  originFormat: SubtitleFormat;
  rawSourceText?: string;
  rawSourceBytes?: Uint8Array;
  cues: Cue[];
  detectedLang?: string | null;
  jobResult: TranslateJobResponse | null;
  translationSignature: string | null;
  renderMode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign: boolean;
  creditEnabled: boolean;
  topAlignOverrides: Map<number, AnCornerOrDefault>;
  downloadFilename: string;
  parseError: boolean;
  parseErrorReason?: ParseErrorReason | null;
}

export interface SubtitleAssist {
  glossary: GlossaryBuffer;
  contextText: string;
}

export interface WorkspaceState {
  files: SubtitleFile[];
  rejectedArchives: RejectedArchive[];
  outputFormat: SubtitleFormat;
  currentHistoryId: string | null;
  historyIncomplete: boolean;
  elapsedMs: number | null;
  provider: string;
  sourceLang: string;
  sourceMode: SourceMode;
  targetLang: string;
  userPickedTargetLang: boolean;
  outputMode: OutputMode;
  stackingOrder: BilingualStacking;
  cueLayout: CueLayout;
  userPickedOutputMode: boolean;
  assFontPreset: AssFontPreset | undefined;
  assCustomPrimarySize: number;
  assCustomSecondarySize: number;
  musicTopAlign: boolean;
  userPickedMusicTopAlign: boolean;
  creditEnabled: boolean;
  creditPreferred: boolean;
  sdhEnabled: boolean;
  caseSensitiveTerms: boolean;
  skipLyrics: boolean;
  fullWidthPunctuation: boolean;
  keepTerminalPunctuation: boolean;
  sceneSeconds: number;
  contextText: string;
  glossaryEntries: DictionaryEntry[];
  assistPerSubtitle: boolean;
  assistFileId: string | null;
  assistByFile: Map<string, SubtitleAssist>;
}

function readStoredProvider(): string {
  const stored = persistentStorage.getItem(STORAGE_KEYS.provider);
  return stored && SELECTABLE_PROVIDERS.includes(stored) ? stored : SELECTABLE_PROVIDERS[0];
}

export function defaultTargetLanguage(provider: string, excluded?: string): string {
  const supported = supportedTags(provider, "target");
  const isUsable = (code: string | undefined): code is string =>
    typeof code === "string" && code.length > 0 && supported.has(code) && code !== excluded;

  const recent = readLanguageMemory();
  const topRecent = recent.find(isUsable);
  if (topRecent) return topRecent;

  const locale = getLocale();
  const featured = quickPickLanguageCodes(locale);
  const topFeatured = featured.find(isUsable);
  if (topFeatured) return topFeatured;

  const collator = new Intl.Collator(locale);
  const available = SELECTABLE_LANGUAGE_CODES
    .filter(isUsable)
    .sort((a, b) => collator.compare(languageName(a, locale), languageName(b, locale)));

  return available[0] ?? SELECTABLE_LANGUAGE_CODES[0];
}

export function createWorkspaceState(): WorkspaceState {
  const provider = readStoredProvider();
  const targetLang = defaultTargetLanguage(provider);
  return {
    files: [],
    rejectedArchives: [],
    outputFormat: "srt",
    currentHistoryId: null,
    historyIncomplete: false,
    elapsedMs: null,
    provider,
    sourceLang: AUTO_DETECT_CODE,
    sourceMode: "local",
    targetLang,
    userPickedTargetLang: false,
    outputMode: "monolingual",
    stackingOrder: "translation_top",
    cueLayout: "single",
    userPickedOutputMode: false,
    assFontPreset: undefined,
    assCustomPrimarySize: 48,
    assCustomSecondarySize: 40,
    musicTopAlign: targetRulesFor(targetLang).alignsMusicToTop,
    userPickedMusicTopAlign: false,
    creditEnabled: DEFAULT_CREDIT_ENABLED,
    creditPreferred: DEFAULT_CREDIT_ENABLED,
    sdhEnabled: true,
    caseSensitiveTerms: false,
    skipLyrics: false,
    fullWidthPunctuation: false,
    keepTerminalPunctuation: false,
    sceneSeconds: DEFAULT_SCENE_CHANGE_SECONDS,
    contextText: "",
    glossaryEntries: [],
    assistPerSubtitle: false,
    assistFileId: null,
    assistByFile: new Map(),
  };
}

export function defaultOutputFormatFor(files: SubtitleFile[]): SubtitleFormat {
  const firstNonAss = files.find((file) => file.originFormat !== "ass");
  return firstNonAss ? firstNonAss.originFormat : "ass";
}

export function fileCountLabel(count: number): string {
  return t("task.fileCount", { count });
}

export function taskHeaderLabel(files: SubtitleFile[]): string {
  return files.length === 1 ? files[0].filename : fileCountLabel(files.length);
}

export function createSubtitleFile(state: WorkspaceState, fields: Pick<SubtitleFile, "filename" | "relativePath" | "sourceFormat" | "originFormat" | "cues"> & Partial<SubtitleFile>): SubtitleFile {
  return {
    id: createId(),
    jobResult: null,
    translationSignature: null,
    renderMode: state.outputMode,
    stacking: state.stackingOrder,
    musicTopAlign: state.musicTopAlign,
    creditEnabled: state.creditEnabled,
    topAlignOverrides: new Map(),
    downloadFilename: "",
    parseError: false,
    ...fields,
  };
}
