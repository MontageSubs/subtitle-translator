import { persistentStorage } from "../../utils/safeStorage";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { DEFAULT_SCENE_CHANGE_SECONDS } from "../../lib/subtitle/common/sceneThreads";
import { AssFontPreset } from "../../lib/subtitle/formats/ass/template";
import { AnCornerOrDefault } from "../../lib/subtitle/formats/topAlign";
import { DEFAULT_CREDIT_ENABLED } from "../../lib/subtitle/formats/credit";
import { AUTO_DETECT_CODE, } from "../../utils/languageProfiles";
import { Cue, OutputMode, BilingualStacking, CueLayout, SubtitleFormat } from "../../lib/subtitle/types";
import { SourceFormat } from "../../lib/subtitle/extraction/encoding";
import type { RejectedArchive } from "../../lib/subtitle/archive";
import { TranslateJobResponse } from "../../api/translation";
import { DictionaryEntry } from "../../utils/dictionary";
import { getLocale, t } from "../../i18n";
import { createId } from "../../utils/id";

export const PROVIDER_STORAGE_KEY = "subtitle-translator:provider";
const SELECTABLE_PROVIDERS = ["google-nmt-pa", "microsoft-nmt-edge"];

export type ParseErrorReason = "invalidFormat" | "noCues";

export type SourceMode = "local" | "cloud" | "forced";

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
}

function readStoredProvider(): string {
  const stored = persistentStorage.getItem(PROVIDER_STORAGE_KEY);
  return stored && SELECTABLE_PROVIDERS.includes(stored) ? stored : SELECTABLE_PROVIDERS[0];
}

export function createWorkspaceState(): WorkspaceState {
  return {
    files: [],
    rejectedArchives: [],
    outputFormat: "srt",
    currentHistoryId: null,
    historyIncomplete: false,
    elapsedMs: null,
    provider: readStoredProvider(),
    sourceLang: AUTO_DETECT_CODE,
    sourceMode: "local",
    targetLang: getLocale(),
    userPickedTargetLang: false,
    outputMode: "monolingual",
    stackingOrder: "translation_top",
    cueLayout: "single",
    userPickedOutputMode: false,
    assFontPreset: undefined,
    assCustomPrimarySize: 48,
    assCustomSecondarySize: 40,
    musicTopAlign: targetRulesFor(getLocale()).alignsMusicToTop,
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
