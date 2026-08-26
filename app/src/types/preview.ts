export interface PreviewCard {
  id: number;
  start: string;
  end: string;
  source: string;
  target: string;
  missing?: boolean;
  warningReason?: string;
  start_ms?: number;
  end_ms?: number;
  targetLang?: string;
  sceneIndex?: number;
}

export interface PreviewApplyResult {
  rawSrt?: string;
  lastUpdatedLabel?: string;
}

export interface PreviewModalOptions {
  lastUpdatedLabel?: string;
  sceneSeconds?: number;
  initialContext?: string;
  initialGlossary?: Array<{ source: string; target: string; caseSensitive?: boolean }>;
  sourceFilename?: string;
  translatedFilename?: string;
  onApply?: (edits: Map<number, string>, contextText?: string, glossaryEntries?: Array<{ source: string; target: string; caseSensitive?: boolean }>) => PreviewApplyResult | void;
}

export type ErrorCategoryKey = "missing" | "overLength" | "overCps";

export interface CardErrorInfo {
  missing: boolean;
  overLength: boolean;
  overCps: boolean;
  cps: number;
}

export type UndoEntry = { id: number; before: string; after: string }[];
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
  getLayoutMetrics(): { offsets: number[]; totalHeight: number };
  getActiveMatchCardId(): number | null;
  getMatchedIds(): number[];
}

export interface PreviewModalHandle {
  close(): void;
}
