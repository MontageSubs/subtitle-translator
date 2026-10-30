import { mountGlossaryEditor, GlossaryBuffer, GlossaryEditorHandle } from "../../components/glossaryEditor";
import { mountSceneSplitField, SceneSplitFieldHandle } from "../../components/sceneSplitField";
import { mountContextField, ContextFieldHandle } from "../../components/contextField";
import { renderScopeSwitcher } from "../../components/scopeSwitcher";
import { t } from "../../i18n";
import { normalizeTermKey } from "../../lib/entities/termKey";
import { isSdhSelectable } from "../../lib/subtitle/extraction/sdh";
import { bundledDictionary, DictionaryEntry } from "../../utils/dictionary";
import { AUTO_DETECT_CODE } from "../../utils/languageProfiles";
import { bufferOf, emptyBuffer, mergeBuffers } from "./assistScope";
import type { WorkspaceContext } from "./context";
import type { SubtitleAssist, SubtitleFile } from "./state";

export interface AssistSnapshot {
  perSubtitle: boolean;
  fileId: string | null;
  glossary: GlossaryBuffer;
  contextText: string;
  byFile: Map<string, SubtitleAssist>;
}

export interface AssistPatch {
  contextText?: string;
  glossaryEntries?: DictionaryEntry[];
}

export interface AssistFieldsHandle {
  glossary: GlossaryEditorHandle;
  scene: SceneSplitFieldHandle;
  context: ContextFieldHandle;
  applyDictionaryFor(languageCode: string): void;
  syncSdh(sourceCode: string): void;
  syncFiles(): void;
  recognitionFiles(): SubtitleFile[];
  applyToFile(file: SubtitleFile, patch: AssistPatch): void;
  capture(): AssistSnapshot;
  restore(snapshot: AssistSnapshot): void;
  reset(): void;
}

const emptyScope = (): SubtitleAssist => ({ glossary: emptyBuffer(), contextText: "" });

const searchableText = (file: SubtitleFile): string => normalizeTermKey(file.cues.map(({ text }) => text).join(" "), false);

export function mountAssistFields(ctx: WorkspaceContext): AssistFieldsHandle {
  const { state } = ctx;
  const glossaryCaseSensitiveToggle = ctx.query<HTMLInputElement>("#glossary-case-sensitive-toggle");
  const skipLyricsToggle = ctx.query<HTMLInputElement>("#skip-lyrics-toggle");
  const sdhToggle = ctx.query<HTMLInputElement>("#sdh-toggle");
  const perSubtitleSetting = ctx.query<HTMLElement>("#per-subtitle-setting");
  const perSubtitleToggle = ctx.query<HTMLInputElement>("#per-subtitle-toggle");
  const switchers = [ctx.query<HTMLElement>("#glossary-switcher"), ctx.query<HTMLElement>("#context-switcher")];
  let sdhPreferred = state.sdhEnabled;
  let appliedDictionaryCode = "";
  let knownOrder = state.files.map(({ id }) => id);

  const glossary: GlossaryEditorHandle = mountGlossaryEditor(ctx.query("#glossary-editor"), state.glossaryEntries, {
    signal: ctx.signal,
    onChange: () => {
      state.glossaryEntries = glossary.getEntries();
      ctx.task.updateHeader();
    },
  });
  const scene = mountSceneSplitField(ctx.root, state, () => state.files.map(({ filename, cues }) => ({ name: filename, cues })), () => ctx.task.updateHeader());
  const context = mountContextField(ctx.root, state, () => ctx.task.updateHeader());

  glossaryCaseSensitiveToggle.addEventListener("change", () => {
    state.caseSensitiveTerms = glossaryCaseSensitiveToggle.checked;
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

  const activeIndex = (): number => (state.assistPerSubtitle ? state.files.findIndex(({ id }) => id === state.assistFileId) : -1);

  function paintScope(): void {
    perSubtitleSetting.hidden = state.files.length < 2;
    perSubtitleToggle.checked = state.assistPerSubtitle;
    const index = activeIndex();
    switchers.forEach((switcher) => {
      switcher.hidden = index < 0;
      if (index >= 0) switcher.innerHTML = renderScopeSwitcher({ name: state.files[index].relativePath, index, total: state.files.length });
    });
  }

  function commitActive(): void {
    if (state.assistFileId) state.assistByFile.set(state.assistFileId, { glossary: glossary.captureBuffer(), contextText: state.contextText });
  }

  function loadScope(scope: SubtitleAssist): void {
    glossary.loadBuffer(scope.glossary);
    context.setText(scope.contextText);
    state.glossaryEntries = glossary.getEntries();
  }

  function activateFile(fileId: string, commit: boolean): void {
    ctx.recognition?.suspend();
    if (commit) commitActive();
    state.assistFileId = fileId;
    loadScope(state.assistByFile.get(fileId) ?? emptyScope());
    paintScope();
    ctx.task.updateHeader();
    ctx.recognition?.refresh();
  }

  function splitIntoSubtitles(): void {
    const shared = glossary.captureBuffer();
    const recognized = new Set(shared.recognized);
    const edited = new Set(shared.edited);
    const texts = state.files.map(searchableText);
    const buffers = state.files.map(emptyBuffer);
    for (const entry of shared.entries) {
      if (!recognized.has(entry)) {
        buffers[0].entries.push(entry);
        continue;
      }
      const key = normalizeTermKey(entry.source, false);
      const owners = texts.flatMap((text, index) => (text.includes(key) ? [index] : []));
      for (const index of owners.length ? owners : [0]) {
        const copy = { ...entry };
        buffers[index].entries.push(copy);
        buffers[index].recognized.push(copy);
        if (edited.has(entry)) buffers[index].edited.push(copy);
      }
    }
    const sharedContext = state.contextText;
    state.assistByFile = new Map(state.files.map(({ id }, index) => [id, { glossary: buffers[index], contextText: index === 0 ? sharedContext : state.assistByFile.get(id)?.contextText ?? "" }]));
    state.assistPerSubtitle = true;
    state.assistFileId = state.files[0].id;
    loadScope(state.assistByFile.get(state.assistFileId)!);
  }

  function mergeIntoShared(commit: boolean): void {
    if (commit) commitActive();
    const scopes = state.files.map(({ id }) => state.assistByFile.get(id) ?? emptyScope());
    state.assistPerSubtitle = false;
    state.assistFileId = null;
    loadScope({ glossary: mergeBuffers(scopes.map((scope) => scope.glossary), state.caseSensitiveTerms), contextText: scopes[0]?.contextText ?? "" });
  }

  function syncFiles(): void {
    const ids = new Set(state.files.map(({ id }) => id));
    state.assistByFile.forEach((_, id) => { if (!ids.has(id)) state.assistByFile.delete(id); });
    if (state.assistPerSubtitle) {
      const activeKept = state.assistFileId !== null && ids.has(state.assistFileId);
      if (state.files.length < 2) {
        ctx.recognition?.suspend();
        mergeIntoShared(activeKept);
        ctx.task.updateHeader();
        ctx.recognition?.refresh();
      } else if (!activeKept) {
        const removedAt = Math.max(0, knownOrder.indexOf(state.assistFileId ?? ""));
        activateFile(state.files[Math.min(removedAt, state.files.length - 1)].id, false);
      }
    }
    knownOrder = state.files.map(({ id }) => id);
    paintScope();
  }

  function step(delta: number, switcher: HTMLElement): void {
    const target = state.files[activeIndex() + delta];
    if (!target) return;
    activateFile(target.id, true);
    const index = activeIndex();
    ctx.announce(t("terms.scope.switched", { name: target.relativePath, current: index + 1, total: state.files.length }));
    (switcher.querySelector<HTMLElement>(`[data-scope-step="${delta}"]:not(:disabled)`) ?? switcher.querySelector<HTMLElement>("[data-scope-step]:not(:disabled)"))?.focus();
  }

  switchers.forEach((switcher) => switcher.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-scope-step]");
    if (button) step(Number(button.dataset.scopeStep), switcher);
  }, { signal: ctx.signal }));

  perSubtitleToggle.addEventListener("change", () => {
    ctx.recognition?.suspend();
    if (perSubtitleToggle.checked) splitIntoSubtitles();
    else mergeIntoShared(true);
    paintScope();
    ctx.task.updateHeader();
    ctx.recognition?.refresh();
  }, { signal: ctx.signal });

  function withDictionary(entries: DictionaryEntry[], previousCode: string, languageCode: string): DictionaryEntry[] {
    const entryKey = ({ source, target }: DictionaryEntry) => `${source.trim()}\u0000${target.trim()}`;
    const previousKeys = new Set(bundledDictionary(previousCode).map(entryKey));
    const userEntries = entries.filter((entry) => !previousKeys.has(entryKey(entry)));
    const userSources = new Set(userEntries.map(({ source }) => source.trim()));
    return [...userEntries, ...bundledDictionary(languageCode).filter(({ source }) => !userSources.has(source.trim()))];
  }

  function applyDictionaryFor(languageCode: string): void {
    if (languageCode === AUTO_DETECT_CODE) return;
    state.assistByFile.forEach((scope, id) => {
      if (!state.assistPerSubtitle || id === state.assistFileId) return;
      const entries = withDictionary(scope.glossary.entries, appliedDictionaryCode, languageCode);
      const kept = new Set(entries);
      scope.glossary = { entries, recognized: scope.glossary.recognized.filter((entry) => kept.has(entry)), edited: scope.glossary.edited.filter((entry) => kept.has(entry)) };
    });
    const entries = withDictionary(state.glossaryEntries, appliedDictionaryCode, languageCode);
    appliedDictionaryCode = languageCode;
    state.glossaryEntries = entries;
    glossary.setEntries(entries);
    ctx.task.updateHeader();
  }

  function applyToFile(file: SubtitleFile, { contextText, glossaryEntries }: AssistPatch): void {
    if (!state.assistPerSubtitle || file.id === state.assistFileId) {
      if (contextText !== undefined) context.setText(contextText);
      if (glossaryEntries !== undefined) {
        state.glossaryEntries = glossaryEntries;
        glossary.setEntries(glossaryEntries);
      }
      return;
    }
    const scope = state.assistByFile.get(file.id) ?? emptyScope();
    state.assistByFile.set(file.id, { glossary: glossaryEntries === undefined ? scope.glossary : bufferOf(glossaryEntries), contextText: contextText ?? scope.contextText });
  }

  return {
    glossary,
    scene,
    context,
    applyDictionaryFor,
    syncSdh,
    syncFiles,
    applyToFile,
    recognitionFiles: () => (state.assistPerSubtitle ? state.files.filter(({ id }) => id === state.assistFileId) : state.files),
    capture: () => ({ perSubtitle: state.assistPerSubtitle, fileId: state.assistFileId, glossary: glossary.captureBuffer(), contextText: state.contextText, byFile: new Map(state.assistByFile) }),
    restore(snapshot) {
      state.assistPerSubtitle = snapshot.perSubtitle;
      state.assistFileId = snapshot.fileId;
      state.assistByFile = new Map(snapshot.byFile);
      loadScope({ glossary: snapshot.glossary, contextText: snapshot.contextText });
    },
    reset() {
      state.assistPerSubtitle = false;
      state.assistFileId = null;
      state.assistByFile.clear();
      loadScope(emptyScope());
      paintScope();
    },
  };
}
