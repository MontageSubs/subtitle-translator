import { numericPartsOf, splitLabel } from "../../http/clientVersion";
import { hmacHex, timingSafeEqual } from "../crypto";
import type { Hello } from "./hello";

export interface ClientEnvironment {
  ua: string;
  origin: string;
}

interface ProtocolScheme {
  claimName: string;
  carriesHash: boolean;
  canonical: (hello: Hello, environment: ClientEnvironment) => string;
  deriveSeal: (key: string, label: string) => Promise<string>;
  claimedPrefix: (label: string, hello: Hello) => string | null;
}

const CLAIM_CHARS = 8;
const LEGACY_SEAL_CHARS = 32;

const PROTOCOL_STARTS: Readonly<Record<string, number>> = { "1.3.19": 1, "1.5.0": 2 };

const canonicalForm = ({ ts, lang }: Hello, { ua, origin }: ClientEnvironment): string => `${ts}\n${lang.join(",")}\n${ua}\n${origin}`;

const SCHEMES: Readonly<Record<number, ProtocolScheme>> = {
  1: {
    claimName: "hash",
    carriesHash: true,
    canonical: canonicalForm,
    deriveSeal: async (key, label) => (await hmacHex(key, label)).slice(0, LEGACY_SEAL_CHARS),
    claimedPrefix: (_label, hello) => hello.hash,
  },
  2: {
    claimName: "build_id",
    carriesHash: false,
    canonical: canonicalForm,
    deriveSeal: (key, label) => hmacHex(key, splitLabel(label).version),
    claimedPrefix: (label) => splitLabel(label).buildId,
  },
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

export const helloCarriesHash = (protocol: number): boolean => SCHEMES[protocol]!.carriesHash;

export const canonicalHello = (protocol: number, hello: Hello, environment: ClientEnvironment): string => SCHEMES[protocol]!.canonical(hello, environment);

export const deriveSeal = (protocol: number, key: string, label: string): Promise<string> => SCHEMES[protocol]!.deriveSeal(key, label);

export function claimDiscrepancy(protocol: number, seal: string, label: string, hello: Hello): string | null {
  const { claimName, claimedPrefix } = SCHEMES[protocol]!;
  const claimed = claimedPrefix(label, hello) ?? "";
  const expected = seal.slice(0, CLAIM_CHARS);
  return timingSafeEqual(expected, claimed) ? null : `${claimName}_mismatch ${claimName}=${claimed} expected_${claimName}=${expected}`;
}
