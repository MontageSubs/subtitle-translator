import { compareVersionLabels } from "./version";

const COMPARATOR_PATTERN = /^(<=|>=|<|>|=)?\s*(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?)$/;

type Operator = "<" | "<=" | ">" | ">=" | "=";
type Comparator = readonly [Operator, string];

function parseComparators(expression: string): Comparator[] {
  return expression
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => {
      const match = COMPARATOR_PATTERN.exec(token);
      if (!match) throw new Error(`Invalid version range "${expression}": unexpected "${token}"`);
      return [(match[1] as Operator | undefined) ?? "=", match[2]!] as const;
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
  return parseComparators(expression).every(([operator, bound]) => SATISFIES[operator](compareVersionLabels(version, bound)));
}
