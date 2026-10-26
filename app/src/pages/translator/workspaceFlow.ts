import { setTranslationCompletedNotDownloaded, setContextOrGlossaryEdited } from "../../lib/unsavedChanges";
import { hasUsableFiles } from "./fileValidation";
import type { WorkspaceContext } from "./context";

export interface WorkspaceFlow {
  filesAdded(): Promise<void>;
  filesRemoved(): void;
  workspaceCleared(): void;
  languageChanged(): void;
  languageDetected(): void;
  sourceLanguageChosen(code: string): void;
  providerChanged(): void;
  formattingChanged(): void;
}

export function createWorkspaceFlow(ctx: WorkspaceContext): WorkspaceFlow {
  const { state } = ctx;

  function languageChanged(): void {
    ctx.assist.syncSdh(ctx.language.sourceCode());
    ctx.output.applyLanguageDefaults({ sourceLang: ctx.language.sourceCode(), targetLang: ctx.language.targetCode() });
    ctx.task.updateHeader();
    ctx.summaries.refresh();
  }

  function filesRemoved(): void {
    ctx.assist.scene.updatePreview();
    ctx.task.updateHeader();
    ctx.language.refreshDetection();
  }

  return {
    async filesAdded() {
      ctx.task.setState("ready");
      filesRemoved();
      if (hasUsableFiles(state)) await ctx.language.detectFiles();
    },
    filesRemoved,
    workspaceCleared() {
      ctx.progress.stop();
      state.glossaryEntries = [];
      ctx.result.reset();
      setTranslationCompletedNotDownloaded(false);
      setContextOrGlossaryEdited(false);
      ctx.assist.context.setText("");
      ctx.assist.glossary.setEntries([]);
      ctx.task.setState("ready");
      ctx.log.clear();
      ctx.language.refreshDetection();
      ctx.summaries.refresh();
    },
    languageChanged,
    languageDetected() {
      languageChanged();
      ctx.assist.scene.updatePreview();
    },
    sourceLanguageChosen: (code) => ctx.assist.applyDictionaryFor(code),
    providerChanged: () => ctx.assist.context.syncAvailability(),
    formattingChanged: () => ctx.result.scheduleRefresh(),
  };
}
