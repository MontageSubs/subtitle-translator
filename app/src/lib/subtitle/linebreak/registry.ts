import { OrthographyRule } from "./types";
import { UNIVERSAL_NO_START, UNIVERSAL_NO_END } from "./universal";
import {
  enRule,
  esRule,
  frRule,
  deRule,
  itRule,
  ptRule,
  nlRule,
  svRule,
  daRule,
  noRule,
  roRule,
  trRule,
} from "./rules/latin";
import { ruRule, ukRule, plRule, csRule } from "./rules/cyrillic";
import { zhHansRule, zhHantRule, yueRule, zhRule, jaRule, koRule } from "./rules/cjk";

const BASE_UNIVERSAL_RULE: OrthographyRule = {
  noLineStart: UNIVERSAL_NO_START,
  noLineEnd: UNIVERSAL_NO_END,
  proclitics: new Set(),
  enclitics: new Set(),
  conjunctions: new Set(),
};

const STATIC_RULES: Record<string, OrthographyRule> = {
  en: enRule,
  es: esRule,
  fr: frRule,
  de: deRule,
  it: itRule,
  pt: ptRule,
  nl: nlRule,
  sv: svRule,
  da: daRule,
  no: noRule,
  ro: roRule,
  tr: trRule,
  ru: ruRule,
  uk: ukRule,
  pl: plRule,
  cs: csRule,
  "zh-hans": zhHansRule,
  "zh-hant": zhHantRule,
  yue: yueRule,
  zh: zhRule,
  ja: jaRule,
  ko: koRule,
};

function resolveLanguageKey(code: string | undefined | null): string {
  const normalized = (code || "en").toLowerCase().trim();
  if (normalized.startsWith("zh")) {
    if (
      normalized.includes("hant") ||
      normalized.includes("tw") ||
      normalized.includes("hk") ||
      normalized.includes("mo")
    ) {
      return "zh-hant";
    }
    return "zh-hans";
  }
  if (normalized.startsWith("yue") || normalized === "cantonese") {
    return "yue";
  }
  return normalized.split("-")[0];
}

export function preloadLanguageRule(_langCode: string): void {}

export function getLanguageRule(langCode: string): OrthographyRule {
  const key = resolveLanguageKey(langCode);
  return STATIC_RULES[key] || BASE_UNIVERSAL_RULE;
}
