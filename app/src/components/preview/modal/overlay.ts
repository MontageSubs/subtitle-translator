export interface Overlay<T> {
  valueOf(id: number): T;
  has(id: number): boolean;
  assign(id: number, value: T): void;
  snapshot(): Map<number, T>;
  unapplied(): Map<number, T>;
  markApplied(): void;
}

export function createOverlay<T>(baseOf: (id: number) => T): Overlay<T> {
  const overrides = new Map<number, T>();
  let applied = new Map<number, T>();

  const valueOf = (id: number): T => overrides.get(id) ?? baseOf(id);

  return {
    valueOf,
    has: (id) => overrides.has(id),
    assign(id, value) {
      if (value === baseOf(id)) overrides.delete(id);
      else overrides.set(id, value);
    },
    snapshot: () => new Map(overrides),
    unapplied() {
      const changed = new Map<number, T>();
      new Set([...overrides.keys(), ...applied.keys()]).forEach((id) => {
        const value = valueOf(id);
        if (value !== (applied.get(id) ?? baseOf(id))) changed.set(id, value);
      });
      return changed;
    },
    markApplied() {
      applied = new Map(overrides);
    },
  };
}
