import { numericPartsOf } from "../../http/clientVersion";
import type { Hello } from "./hello";

export interface ClientEnvironment {
  ua: string;
  origin: string;
}

const PROTOCOL_STARTS: Readonly<Record<string, number>> = { "1.3.19": 1 };

const CANONICAL_FORMS: Readonly<Record<number, (hello: Hello, environment: ClientEnvironment) => string>> = {
  1: ({ ts, lang }, { ua, origin }) => `${ts}\n${lang.join(",")}\n${ua}\n${origin}`,
};

const compareParts = (left: readonly number[], right: readonly number[]): number => {
  for (let index = 0; index < left.length; index++) {
    const difference = left[index]! - right[index]!;
    if (difference) return difference;
  }
  return 0;
};

const starts = Object.entries(PROTOCOL_STARTS)
  .map(([version, protocol]) => ({ parts: numericPartsOf(version)!, protocol }))
  .sort((earlier, later) => compareParts(later.parts, earlier.parts));

export function protocolOf(version: string): number | null {
  const parts = numericPartsOf(version);
  return parts ? (starts.find((start) => compareParts(parts, start.parts) >= 0)?.protocol ?? null) : null;
}

export const canonicalHello = (protocol: number, hello: Hello, environment: ClientEnvironment): string => CANONICAL_FORMS[protocol]!(hello, environment);
