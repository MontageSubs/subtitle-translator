import type { HistoryGateHandle } from "./historyGate";
import type { LogPanelHandle } from "../../components/logPanel";
import type { WorkspaceState } from "./state";
import type { SettingSummariesHandle } from "./settingSummaries";
import type { TaskPanelHandle } from "./taskPanel";
import type { RunProgressHandle } from "./runProgress";
import type { LanguageStepHandle } from "./languageStep";
import type { AssistFieldsHandle } from "./assistFields";
import type { OutputOptionsHandle } from "./outputOptions";
import type { FileQueueHandle } from "./fileQueue";
import type { ResultPanelHandle } from "./resultPanel";
import type { WorkspaceFlow } from "./workspaceFlow";
import type { TermRecognitionHandle } from "./termRecognition";

export interface WorkspaceContext {
  root: HTMLElement;
  signal: AbortSignal;
  state: WorkspaceState;
  query<T extends HTMLElement>(selector: string): T;
  announce(message: string): void;
  log: LogPanelHandle;
  summaries: SettingSummariesHandle;
  task: TaskPanelHandle;
  progress: RunProgressHandle;
  language: LanguageStepHandle;
  assist: AssistFieldsHandle;
  recognition: TermRecognitionHandle;
  output: OutputOptionsHandle;
  files: FileQueueHandle;
  result: ResultPanelHandle;
  historyGate: HistoryGateHandle;
  flow: WorkspaceFlow;
}
