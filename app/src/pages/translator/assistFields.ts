import { mountGlossaryEditor, GlossaryEditorHandle } from "../../components/glossaryEditor";
import { mountSceneSplitField, SceneSplitFieldHandle } from "../../components/sceneSplitField";
import { mountContextField, ContextFieldHandle } from "../../components/contextField";
import { loadBundledDictionary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import type { WorkspaceContext } from "./context";

export interface AssistFieldsHandle {
  glossary: GlossaryEditorHandle;
  scene: SceneSplitFieldHandle;
  context: ContextFieldHandle;
  loadDictionaryFor(languageCode: string): Promise<void>;
}

export function mountAssistFields(ctx: WorkspaceContext): AssistFieldsHandle {
  const { state } = ctx;
  const caseSensitiveToggle = ctx.query<HTMLInputElement>("#case-sensitive-toggle");

  const glossary: GlossaryEditorHandle = mountGlossaryEditor(ctx.query("#glossary-editor"), state.glossaryEntries, {
    signal: ctx.signal,
    onChange: () => {
      state.glossaryEntries = glossary.getEntries();
      ctx.task.updateHeader();
    },
  });
  const scene = mountSceneSplitField(ctx.root, state, () => state.files[0]?.cues, () => ctx.task.updateHeader());
  const context = mountContextField(ctx.root, state, () => ctx.task.updateHeader());

  caseSensitiveToggle.addEventListener("change", () => {
    state.caseSensitiveTerms = caseSensitiveToggle.checked;
  }, { signal: ctx.signal });

  async function loadDictionaryFor(languageCode: string): Promise<void> {
    if (languageCode === AUTO_DETECT_CODE) return;
    const entries = await loadBundledDictionary(languageCode);
    state.glossaryEntries = entries;
    glossary.setEntries(entries);
    ctx.task.updateHeader();
  }

  return { glossary, scene, context, loadDictionaryFor };
}
