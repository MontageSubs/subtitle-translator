import { SubtitleFormat, OutputMode, CueLayout } from '../../lib/subtitle/types';
import { AnCornerOrDefault } from '../../lib/subtitle/formats/topAlign';
import type { PositionRule } from '../../lib/subtitle/formats/cueLayout';
import { GlossaryEntry } from '../../utils/glossary';

export interface PreviewCard {
  id: number;
  start: string;
  end: string;
  source: string;
  target: string;
  missing?: boolean;
  leaked?: boolean;
  warningReason?: string;
  start_ms?: number;
  end_ms?: number;
  sourceLang?: string;
  targetLang?: string;
  sceneIndex?: number;
  topAlignAn?: AnCornerOrDefault;
  locked?: boolean;
}

export interface PreviewApplyPayload {
  edits: Map<number, string>;
  contextText?: string;
  glossaryEntries?: GlossaryEntry[];
  positionEdits?: Map<number, AnCornerOrDefault>;
}

export interface PreviewApplyResult {
  rawSrt?: string;
  lastUpdatedLabel?: string;
}

export interface PreviewModalOptions {
  format?: SubtitleFormat;
  lastUpdatedLabel?: string;
  sceneSeconds?: number;
  initialContext?: string;
  provider?: string;
  initialGlossary?: GlossaryEntry[];
  sourceFilename?: string;
  translatedFilename?: string;
  sourceLang?: string;
  targetLang?: string;
  outputMode?: OutputMode;
  cueLayout?: CueLayout;
  positionRule?: PositionRule;
  trueOriginalSourceText?: string;
  trueOriginalSourceBytes?: Uint8Array;
  onApply?: (payload: PreviewApplyPayload) => PreviewApplyResult | void;
}

export type ErrorCategoryKey = "missing" | "overLength" | "overCps" | "leaked";

export interface CardErrorInfo {
  missing: boolean;
  overLength: boolean;
  overCps: boolean;
  leaked: boolean;
  cps: number;
}

export interface TextChange {
  kind: "text";
  id: number;
  before: string;
  after: string;
}

interface PositionChange {
  kind: "position";
  id: number;
  before: AnCornerOrDefault;
  after: AnCornerOrDefault;
}

type UndoChange = TextChange | PositionChange;
export type UndoEntry = UndoChange[];
export type SearchMode = "highlight" | "filter";

export interface TimeSearchResult {
  isTime: boolean;
  isRange: boolean;
  startMs: number;
  endMs?: number;
}

export interface CardsViewResult {
  matchedCount: number;
  totalCount: number;
  activeIndex: number;
  activeId: number | null;
}

export interface CardsView {
  setFilter(query: string, mode: SearchMode): CardsViewResult;
  navigateMatch(direction: "next" | "prev"): CardsViewResult;
  scrollToId(id: number): void;
  refresh(): void;
  preserveAnchor(mutate: () => void): void;
  adjustCardHeight(id: number): void;
  getLayoutMetrics(): { offsets: number[]; totalHeight: number };
  getActiveMatchCardId(): number | null;
  getMatchedIds(): number[];
  getDisplayedCards(): PreviewCard[];
}

export interface PreviewModalHandle {
  close(): void;
}
