import type { LogPanelHandle } from "../../components/logPanel";
import type { WorkspaceState } from "./state";
import type { TaskPanelHandle } from "./taskPanel";
import type { RunProgressHandle } from "./runProgress";
import type { LanguageStepHandle } from "./languageStep";
import type { AssistFieldsHandle } from "./assistFields";
import type { OutputOptionsHandle } from "./outputOptions";
import type { FileQueueHandle } from "./fileQueue";
import type { ResultPanelHandle } from "./resultPanel";
import type { StatsHandle } from "./stats";
import type { WorkspaceFlow } from "./workspaceFlow";

export interface WorkspaceContext {
  root: HTMLElement;
  signal: AbortSignal;
  state: WorkspaceState;
  query<T extends HTMLElement>(selector: string): T;
  log: LogPanelHandle;
  task: TaskPanelHandle;
  progress: RunProgressHandle;
  language: LanguageStepHandle;
  assist: AssistFieldsHandle;
  output: OutputOptionsHandle;
  files: FileQueueHandle;
  result: ResultPanelHandle;
  stats: StatsHandle;
  flow: WorkspaceFlow;
}
