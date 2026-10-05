import { AnCornerOrDefault } from "../../../lib/subtitle/formats/topAlign";
import { CardErrorInfo, CardsView, ErrorCategoryKey, PreviewCard, PreviewModalOptions, SearchMode } from "../types";
import type { EditHistoryHandle } from "./editHistory";
import type { ErrorPanelHandle } from "./errorPanel";
import type { SearchBarHandle } from "./searchBar";
import type { PreviewTab } from "./markup";

export interface PreviewSession {
  readonly backdrop: HTMLElement;
  readonly signal: AbortSignal;
  readonly options: PreviewModalOptions;
  readonly cards: PreviewCard[];
  readonly edits: Map<number, string>;
  readonly errorMap: Map<number, CardErrorInfo>;
  readonly activeCategories: Set<ErrorCategoryKey>;
  readonly positionEdits: Map<number, AnCornerOrDefault>;
  readonly selectedForBatch: Set<number>;
  readonly softWarningMode: boolean;
  searchMode: SearchMode;
  activeTab: PreviewTab;
  view: CardsView;
  history: EditHistoryHandle;
  errors: ErrorPanelHandle;
  search: SearchBarHandle;
  query<T extends HTMLElement>(selector: string): T;
  currentTarget(card: PreviewCard): string;
  markDirty(): void;
  selectTab(tab: PreviewTab): void;
}
