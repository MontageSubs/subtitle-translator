const COMPARATOR_PATTERN = /^(<=|>=|<|>|=)?\s*(\d+(?:\.\d+){0,3})$/;

type Operator = "<" | "<=" | ">" | ">=" | "=";
type Comparator = readonly [Operator, readonly number[]];

const parseParts = (version: string): number[] => version.split(".").map(Number);

function compareParts(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function parseComparators(expression: string): Comparator[] {
  return expression
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => {
      const match = COMPARATOR_PATTERN.exec(token);
      if (!match) throw new Error(`Invalid version range "${expression}": unexpected "${token}"`);
      return [(match[1] as Operator | undefined) ?? "=", parseParts(match[2]!)] as const;
    });
}

const SATISFIES: Record<Operator, (order: number) => boolean> = {
  "<": (order) => order < 0,
  "<=": (order) => order <= 0,
  ">": (order) => order > 0,
  ">=": (order) => order >= 0,
  "=": (order) => order === 0,
};

export function assertVersionRange(expression: string): void {
  parseComparators(expression);
}

export function matchesVersionRange(expression: string, version: string): boolean {
  const current = parseParts(version);
  return parseComparators(expression).every(([operator, bound]) => SATISFIES[operator](compareParts(current, bound)));
}
