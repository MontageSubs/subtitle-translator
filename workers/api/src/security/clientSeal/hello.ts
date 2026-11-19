import { isLanguageList } from "./language";

const HEX_PATTERN = /^[0-9a-f]{8}$/;

export interface Hello {
  ts: number;
  lang: string[];
  hash: string;
  mac: string;
}

export function parseHello(raw: unknown): Hello | null {
  const { ts, lang, hash, mac } = (raw ?? {}) as { ts?: unknown; lang?: unknown; hash?: unknown; mac?: unknown };
  if (!Number.isSafeInteger(ts) || !isLanguageList(lang)) return null;
  if (typeof hash !== "string" || !HEX_PATTERN.test(hash) || typeof mac !== "string" || !HEX_PATTERN.test(mac)) return null;
  return { ts: ts as number, lang, hash, mac };
}
