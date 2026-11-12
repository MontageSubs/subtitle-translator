import {
  buildLanguageRows, defaultKeyOf, LanguageRow, resolveKey, rowKeysOf, sortKeys,
} from "../../lib/subtitle/variants/selection";
import type { VariantGroup } from "../../lib/subtitle/variants/types";

export interface ChoiceState {
  groups: readonly VariantGroup[];
  order: readonly string[];
  rows: LanguageRow[];
  languageKey: string;
  perFile: boolean;
  activeIndex: number;
  picks: Map<string, string>;
}

export function createChoiceState(groups: readonly VariantGroup[], order: readonly string[], initial?: ReadonlyMap<string, string>): ChoiceState {
  const rows = buildLanguageRows(groups, order);
  const firstInitial = groups.length ? initial?.get(groups[0].id) : undefined;
  return {
    groups,
    order,
    rows,
    languageKey: firstInitial && rows.some((row) => row.key === firstInitial) ? firstInitial : rows[0].key,
    perFile: false,
    activeIndex: 0,
    picks: new Map(initial),
  };
}

export function keyFor(state: ChoiceState, group: VariantGroup): string {
  const keys = rowKeysOf(group);
  const picked = state.perFile ? state.picks.get(group.id) : undefined;
  if (picked !== undefined && keys.includes(picked)) return picked;
  return keys.includes(state.languageKey) ? state.languageKey : defaultKeyOf(group, state.order);
}

export const activeGroup = (state: ChoiceState): VariantGroup => state.groups[state.activeIndex];

export const canSelectPerFile = (state: ChoiceState): boolean => state.groups.length > 1;

export function setPerFile(state: ChoiceState, enabled: boolean): void {
  if (enabled) for (const group of state.groups) state.picks.set(group.id, keyFor(state, group));
  state.perFile = enabled && canSelectPerFile(state);
}

export function selectKey(state: ChoiceState, key: string): void {
  if (state.perFile) state.picks.set(activeGroup(state).id, key);
  else state.languageKey = key;
}

export function selectedKey(state: ChoiceState): string {
  return state.perFile ? keyFor(state, activeGroup(state)) : state.languageKey;
}

export function stepFile(state: ChoiceState, delta: number): void {
  state.activeIndex = Math.min(state.groups.length - 1, Math.max(0, state.activeIndex + delta));
}

export const groupKeysSorted = (state: ChoiceState, group: VariantGroup): string[] => sortKeys(rowKeysOf(group), state.order);

export function fallbackGroupCount(state: ChoiceState): number {
  return state.perFile ? 0 : state.groups.filter((group) => !rowKeysOf(group).includes(state.languageKey)).length;
}

export function resolveSelection(state: ChoiceState): Map<string, string> {
  return new Map(state.groups.map((group) => [group.id, resolveKey(group, keyFor(state, group), state.order).id]));
}
