import { PreviewCard, UndoEntry } from "../types";
import { createOverlay } from "./overlay";

export interface EditModel {
  targetOf(card: PreviewCard): string;
  isEdited(id: number): boolean;
  set(id: number, text: string): string;
  replace(cards: PreviewCard[], query: string, replacement: string, all: boolean): UndoEntry;
  snapshot(): Map<number, string>;
  unapplied(): Map<number, string>;
  markApplied(): void;
}

export function createEditModel(cards: PreviewCard[], normalize: (text: string) => string): EditModel {
  const originalById = new Map(cards.map((card) => [card.id, card.target]));
  const lockedIds = new Set(cards.filter((card) => card.locked).map((card) => card.id));
  const overlay = createOverlay((id) => originalById.get(id) ?? "");

  const targetOf = (card: PreviewCard) => overlay.valueOf(card.id);

  function set(id: number, text: string): string {
    if (lockedIds.has(id)) return originalById.get(id) ?? text;
    const normalized = normalize(text);
    overlay.assign(id, normalized);
    return normalized;
  }

  return {
    targetOf,
    isEdited: overlay.has,
    set,
    replace(candidates, query, replacement, all) {
      const entry: UndoEntry = [];
      for (const card of candidates) {
        if (lockedIds.has(card.id)) continue;
        const before = targetOf(card);
        const after = normalize(all ? before.split(query).join(replacement) : before.replace(query, () => replacement));
        if (after === before) continue;
        set(card.id, after);
        entry.push({ kind: "text", id: card.id, before, after });
      }
      return entry;
    },
    snapshot: overlay.snapshot,
    unapplied: overlay.unapplied,
    markApplied: overlay.markApplied,
  };
}
