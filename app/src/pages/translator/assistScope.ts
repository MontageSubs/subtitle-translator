import { normalizeTermKey } from "../../lib/entities/termKey";
import type { GlossaryBuffer } from "../../components/glossaryEditor";
import type { DictionaryEntry } from "../../utils/dictionary";
import type { SubtitleFile, WorkspaceState } from "./state";

export interface ResolvedAssist {
  glossaryEntries: DictionaryEntry[];
  contextText: string;
}

export interface AssistTotals {
  hasContext: boolean;
  glossaryCount: number;
}

const isCompleteEntry = ({ source, target }: DictionaryEntry): boolean => Boolean(source.trim() && target.trim());

export function mergeBuffers(buffers: readonly GlossaryBuffer[], caseSensitive: boolean): GlossaryBuffer {
  const merged = new Map<string, DictionaryEntry>();
  const recognized = new Set<DictionaryEntry>();
  const edited = new Set<DictionaryEntry>();
  for (const buffer of buffers) {
    const recognizedHere = new Set(buffer.recognized);
    const editedHere = new Set(buffer.edited);
    for (const entry of buffer.entries) {
      const key = normalizeTermKey(entry.source, caseSensitive);
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        const copy = { ...entry };
        merged.set(key, copy);
        if (recognizedHere.has(entry)) recognized.add(copy);
        if (editedHere.has(entry)) edited.add(copy);
      } else if (!existing.target.trim() && entry.target.trim()) {
        existing.target = entry.target;
        if (editedHere.has(entry)) edited.add(existing);
      }
    }
  }
  return { entries: [...merged.values()], recognized: [...recognized], edited: [...edited] };
}

export const emptyBuffer = (): GlossaryBuffer => ({ entries: [], recognized: [], edited: [] });

export const bufferOf = (entries: DictionaryEntry[]): GlossaryBuffer => ({ entries, recognized: [], edited: [] });

export function assistFor(state: WorkspaceState, file: SubtitleFile): ResolvedAssist {
  if (!state.assistPerSubtitle || file.id === state.assistFileId) return { glossaryEntries: state.glossaryEntries, contextText: state.contextText };
  const stored = state.assistByFile.get(file.id);
  return { glossaryEntries: stored ? stored.glossary.entries.filter(isCompleteEntry) : [], contextText: stored?.contextText ?? "" };
}

export function jobAssist(state: WorkspaceState): ResolvedAssist {
  if (!state.assistPerSubtitle) return { glossaryEntries: state.glossaryEntries, contextText: state.contextText };
  const perFile = state.files.map((file) => assistFor(state, file));
  return {
    glossaryEntries: mergeBuffers(perFile.map(({ glossaryEntries }) => bufferOf(glossaryEntries)), state.caseSensitiveTerms).entries,
    contextText: perFile[0]?.contextText ?? "",
  };
}

export function assistTotals(state: WorkspaceState): AssistTotals {
  const perFile = state.assistPerSubtitle ? state.files.map((file) => assistFor(state, file)) : [jobAssist(state)];
  return {
    hasContext: perFile.some(({ contextText }) => contextText.trim().length > 0),
    glossaryCount: jobAssist(state).glossaryEntries.length,
  };
}
