import { mountGlossaryEditor, GlossaryEditorHandle } from "../../components/glossaryEditor";
import { mountSceneSplitField, SceneSplitFieldHandle } from "../../components/sceneSplitField";
import { mountContextField, ContextFieldHandle } from "../../components/contextField";
import { isSdhSelectable } from "../../lib/subtitle/extraction/sdh";
import { bundledDictionary } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import type { WorkspaceContext } from "./context";

export interface AssistFieldsHandle {
  glossary: GlossaryEditorHandle;
  scene: SceneSplitFieldHandle;
  context: ContextFieldHandle;
  applyDictionaryFor(languageCode: string): void;
  syncSdh(sourceCode: string): void;
}

export function mountAssistFields(ctx: WorkspaceContext): AssistFieldsHandle {
  const { state } = ctx;
  const caseSensitiveToggle = ctx.query<HTMLInputElement>("#case-sensitive-toggle");
  const skipLyricsToggle = ctx.query<HTMLInputElement>("#skip-lyrics-toggle");
  const sdhToggle = ctx.query<HTMLInputElement>("#sdh-toggle");
  let sdhPreferred = state.sdhEnabled;

  const glossary: GlossaryEditorHandle = mountGlossaryEditor(ctx.query("#glossary-editor"), state.glossaryEntries, {
    signal: ctx.signal,
    onChange: () => {
      state.glossaryEntries = glossary.getEntries();
      ctx.task.updateHeader();
    },
  });
  const scene = mountSceneSplitField(ctx.root, state, () => state.files.map(({ filename, cues }) => ({ name: filename, cues })), () => ctx.task.updateHeader());
  const context = mountContextField(ctx.root, state, () => ctx.task.updateHeader());

  caseSensitiveToggle.addEventListener("change", () => {
    state.caseSensitiveTerms = caseSensitiveToggle.checked;
  }, { signal: ctx.signal });
  skipLyricsToggle.addEventListener("change", () => {
    state.skipLyrics = skipLyricsToggle.checked;
  }, { signal: ctx.signal });
  sdhToggle.addEventListener("change", () => {
    sdhPreferred = sdhToggle.checked;
    state.sdhEnabled = sdhPreferred;
    ctx.task.updateHeader();
  }, { signal: ctx.signal });

  function syncSdh(sourceCode: string): void {
    const selectable = isSdhSelectable(sourceCode);
    state.sdhEnabled = selectable && sdhPreferred;
    sdhToggle.checked = state.sdhEnabled;
    sdhToggle.disabled = !selectable;
    ctx.task.updateHeader();
  }

  function applyDictionaryFor(languageCode: string): void {
    if (languageCode === AUTO_DETECT_CODE) return;
    const entries = bundledDictionary(languageCode);
    state.glossaryEntries = entries;
    glossary.setEntries(entries);
    ctx.task.updateHeader();
  }

  return { glossary, scene, context, applyDictionaryFor, syncSdh };
}
