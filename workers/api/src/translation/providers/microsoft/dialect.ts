import type { Adapter, Dialect } from "../../engine/adapter";
import { stripMarkerDebris } from "../../engine/markerRepair";
import { encodeWithDictionary } from "./encode";
import { restoreFormattingTags, sanitizeStyleTags } from "./formatting";
import { initialPass } from "./initialPass";
import { normalizeMicrosoftLang } from "./langCodes";
import { createMicrosoftTransport } from "./transport";

const AUTO_LANG = "";
const POOL_SIZE = 19;

export function createMicrosoftAdapter(userAgent: string): Adapter {
  const dialect: Dialect = {
    id: "microsoft-nmt-edge",
    autoLang: AUTO_LANG,
    poolSize: POOL_SIZE,
    spacedCueJoin: false,
    transport: createMicrosoftTransport(userAgent),
    normalizeLang: normalizeMicrosoftLang,
    encode: encodeWithDictionary,
    wrap: (body) => body,
    restore: (flat) => restoreFormattingTags(flat.trim()),
    applyTerms: (translated) => translated,
    polish: (text) => sanitizeStyleTags(stripMarkerDebris(restoreFormattingTags(text)).trim()),
  };
  return { dialect, initialPass };
}
