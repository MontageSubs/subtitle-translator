import type { Adapter, Dialect } from "../../engine/adapter";
import { applyTermReplacements } from "../../engine/terms";
import { activateNoTranslateSpans, escapeHtmlPreservingStyle, markTermsForTransport } from "./html";
import { createInitialPass } from "./initialPass";
import { sanitizeStyleTags } from "./styleTags";
import { createPackedTransport, type GoogleHtmlTransport } from "./transport";

const AUTO_LANG = "auto";
const PACKED_POOL_SIZE = 6;

export function createGoogleAdapter(id: string, raw: GoogleHtmlTransport, userAgent: string | undefined): Adapter {
  const dialect: Dialect = {
    id,
    autoLang: AUTO_LANG,
    poolSize: PACKED_POOL_SIZE,
    spacedCueJoin: true,
    transport: createPackedTransport(raw, userAgent),
    normalizeLang: (code) => code,
    encode: (text, matches) => activateNoTranslateSpans(escapeHtmlPreservingStyle(markTermsForTransport(text, matches))),
    wrap: (body) => `<div>${body}</div>`,
    restore: (flat) => flat,
    applyTerms: (translated, original, matches, rules) => applyTermReplacements(translated, original, matches, rules.collapsesTermWhitespace),
    polish: sanitizeStyleTags,
  };
  return { dialect, initialPass: createInitialPass(raw, userAgent) };
}
