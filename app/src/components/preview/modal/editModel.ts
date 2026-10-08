import { PreviewCard, UndoEntry } from "../types";

export type ReplayDirection = "before" | "after";

export interface EditModel {
  targetOf(card: PreviewCard): string;
  isEdited(id: number): boolean;
  set(id: number, text: string): void;
  replace(cards: PreviewCard[], query: string, replacement: string, all: boolean): UndoEntry;
  replay(entry: UndoEntry, direction: ReplayDirection): void;
  snapshot(): Map<number, string>;
}

export function createEditModel(cards: PreviewCard[]): EditModel {
  const originalById = new Map(cards.map((card) => [card.id, card.target]));
  const edits = new Map<number, string>();

  const targetOf = (card: PreviewCard) => edits.get(card.id) ?? card.target;

  function set(id: number, text: string): void {
    if (text === originalById.get(id)) edits.delete(id);
    else edits.set(id, text);
  }

  return {
    targetOf,
    isEdited: (id) => edits.has(id),
    set,
    replace(candidates, query, replacement, all) {
      const entry: UndoEntry = [];
      for (const card of candidates) {
        const before = targetOf(card);
        const after = all ? before.split(query).join(replacement) : before.replace(query, () => replacement);
        if (after === before) continue;
        set(card.id, after);
        entry.push({ id: card.id, before, after });
      }
      return entry;
    },
    replay: (entry, direction) => entry.forEach((item) => set(item.id, item[direction])),
    snapshot: () => new Map(edits),
  };
}
