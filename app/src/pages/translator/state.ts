import { persistentStorage } from "../../utils/safeStorage";
import { targetRulesFor } from "../../lib/subtitle/language/resolve";
import { DEFAULT_SCENE_CHANGE_SECONDS } from "../../lib/subtitle/extraction/chapters";
import { AssFontPreset } from "../../lib/subtitle/formats/ass/template";
import { AnCornerOrDefault } from "../../lib/subtitle/formats/topAlign";
import { AUTO_DETECT_CODE, } from "../../utils/languageProfiles";
import { Cue, OutputMode, BilingualStacking, CueLayout, SubtitleFormat } from "../../lib/subtitle/types";
import { SourceFormat } from "../../lib/subtitle/extraction/encoding";
import { TranslateJobResponse } from "../../api/translation";
import { DictionaryEntry } from "../../utils/dictionary";
import { getLocale, t } from "../../i18n";
import { createId } from "../../utils/id";

export const PROVIDER_STORAGE_KEY = "subtitle-translator:provider";
const SELECTABLE_PROVIDERS = ["google-nmt-pa", "microsoft-nmt-edge"];

export type ParseErrorReason = "invalidFormat" | "noCues";

export interface SubtitleFile {
  id: string;
  filename: string;
  relativePath: string;
  sourceFormat: SourceFormat | null;
  originFormat: SubtitleFormat;
  rawSourceText?: string;
  rawSourceBytes?: Uint8Array;
  cues: Cue[];
  jobResult: TranslateJobResponse | null;
  renderMode: OutputMode;
  stacking: BilingualStacking;
  musicTopAlign: boolean;
  topAlignOverrides: Map<number, AnCornerOrDefault>;
  downloadFilename: string;
  parseError: boolean;
  parseErrorReason?: ParseErrorReason | null;
}

export interface WorkspaceState {
  files: SubtitleFile[];
  rejectedArchives: string[];
  outputFormat: SubtitleFormat;
  currentHistoryId: string | null;
  provider: string;
  sourceLang: string;
  userPickedSourceLang: boolean;
  targetLang: string;
  userPickedTargetLang: boolean;
  outputMode: OutputMode;
  stackingOrder: BilingualStacking;
  cueLayout: CueLayout;
  userPickedOutputMode: boolean;
  assEqualBilingualSize: boolean;
  assFontPreset: AssFontPreset | undefined;
  assCustomPrimarySize: number;
  assCustomSecondarySize: number;
  musicTopAlign: boolean;
  userPickedMusicTopAlign: boolean;
  sdhEnabled: boolean;
  caseSensitiveTerms: boolean;
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
    provider: readStoredProvider(),
    sourceLang: AUTO_DETECT_CODE,
    userPickedSourceLang: false,
    targetLang: getLocale(),
    userPickedTargetLang: false,
    outputMode: "monolingual",
    stackingOrder: "translation_top",
    cueLayout: "single",
    userPickedOutputMode: false,
    assEqualBilingualSize: false,
    assFontPreset: undefined,
    assCustomPrimarySize: 48,
    assCustomSecondarySize: 40,
    musicTopAlign: targetRulesFor(getLocale()).alignsMusicToTop,
    userPickedMusicTopAlign: false,
    sdhEnabled: true,
    caseSensitiveTerms: false,
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
    renderMode: state.outputMode,
    stacking: state.stackingOrder,
    musicTopAlign: state.musicTopAlign,
    topAlignOverrides: new Map(),
    downloadFilename: "",
    parseError: false,
    ...fields,
  };
}
