import type { EntityLanguageRules, TextRange } from "./rules/shared";

export interface NameLocks {
  add(source: string): void;
  cover(unit: string): TextRange[];
  list(): string[];
}

const SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

export function createNameLocks(rules: EntityLanguageRules, caseSensitive: boolean, initial: readonly string[] = []): NameLocks {
  const names = new Set<string>();
  let pattern: RegExp | null = null;
  const compile = (): RegExp | null => {
    if (!names.size) return null;
    const alternatives = [...names].sort((left, right) => right.length - left.length || left.localeCompare(right)).map((name) => name.replace(SPECIAL_CHARACTERS, "\\$&"));
    return new RegExp(`${rules.lockBoundary.before}(?:${alternatives.join("|")})${rules.lockBoundary.after}`, caseSensitive ? "gu" : "giu");
  };
  const locks: NameLocks = {
    add(source) {
      if (names.has(source)) return;
      names.add(source);
      pattern = null;
    },
    cover(unit) {
      pattern ??= compile();
      if (!pattern) return [];
      return [...unit.matchAll(pattern)].map((match) => ({ start: match.index!, end: match.index! + match[0].length }));
    },
    list: () => [...names],
  };
  initial.forEach(locks.add);
  return locks;
}
