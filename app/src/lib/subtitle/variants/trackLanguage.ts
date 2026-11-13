import { SELECTABLE_LANGUAGE_CODES } from "../../../utils/languageProfiles";
import { nativeLanguageName } from "../../../utils/languageNames";
import { canonicalTag } from "../../../utils/providerLanguages";
import { regionFromTag, regionFromTrackName } from "./trackNameTraits";
import { isKnownThreeLetterCode, twoLetterCodeOf, UNDETERMINED_CODES } from "./iso6392";

export interface TrackLanguageMetadata {
  language: string | null;
  languageTag: string | null;
  name: string | null;
}

const SIMPLIFIED = "zh-Hans";
const TRADITIONAL = "zh-Hant";
const CANTONESE = "yue";
const NAME_LOCALES = ["en", "zh-Hans", "zh-Hant"] as const;
const TRADITIONAL_REGIONS: ReadonlySet<string> = new Set(["tw", "hk", "mo"]);
const SHORT_NAME_PATTERN = /^[a-z]{2}(?:[-_][a-z0-9]+)*$/;
const MAX_TOKENS_FOR_ISO_TOKEN = 3;
const MAX_NAME_GRAM = 3;
const MIN_CJK_KEY_LENGTH = 2;
const CJK_PATTERN = /[぀-ヿ㐀-鿿가-힯]/;

const CHINESE_HINT = /中文|汉语|漢語|华语|華語|国语|國語|普通话|普通話|chinese|mandarin|\bchi\b|\bzho\b|\bzh\b|\bchs\b|\bcht\b|简体|簡體|繁体|繁體|简中|簡中|繁中|简日|繁日|简英|繁英|\bgb\b|big5/;
const TRADITIONAL_HINT = /繁|traditional|\bcht\b|\btc\b|big5|zh[-_ ]?(?:hant|tw|hk|mo)|台|臺|香港/;
const CANTONESE_HINT = /粤|粵|廣東|广东|cantonese|\byue\b/;

const NAME_ALIASES: ReadonlyMap<string, string> = new Map([
  ["jp", "ja"], ["jap", "ja"], ["kr", "ko"], ["英文", "en"], ["日文", "ja"], ["韩文", "ko"], ["韓文", "ko"], ["法文", "fr"], ["德文", "de"],
  ["俄文", "ru"], ["西语", "es"], ["西語", "es"], ["西班牙文", "es"], ["葡文", "pt"], ["意文", "it"], ["泰文", "th"], ["越南文", "vi"], ["阿拉伯文", "ar"],
]);

const selectable = new Set(SELECTABLE_LANGUAGE_CODES);
const caseInsensitive = new Map(SELECTABLE_LANGUAGE_CODES.map((code) => [code.toLowerCase(), code]));

let nameIndex: Map<string, string> | null = null;

const baseOf = (tag: string): string => tag.split("-")[0].toLowerCase();

function chineseTagFrom(tag: string): string {
  const lowered = tag.toLowerCase();
  if (lowered.includes("hant")) return TRADITIONAL;
  if (lowered.includes("hans")) return SIMPLIFIED;
  return lowered.split(/[-_]/).some((part) => TRADITIONAL_REGIONS.has(part)) ? TRADITIONAL : SIMPLIFIED;
}

export function selectableTagFor(code: string): string | null {
  const cleaned = code.trim().replace(/_/g, "-");
  if (!cleaned) return null;
  if (baseOf(cleaned) === "zh") return chineseTagFrom(cleaned);
  const canonical = canonicalTag(cleaned);
  if (selectable.has(canonical)) return canonical;
  const exact = caseInsensitive.get(canonical.toLowerCase());
  if (exact) return exact;
  const base = baseOf(canonical);
  return caseInsensitive.get(base) ?? SELECTABLE_LANGUAGE_CODES.find((candidate) => baseOf(candidate) === base) ?? null;
}

function registerName(index: Map<string, string>, name: string | undefined, code: string): void {
  const key = name?.normalize("NFKC").toLowerCase().trim();
  if (key && !index.has(key)) index.set(key, code);
}

function buildNameIndex(): Map<string, string> {
  const index = new Map<string, string>();
  const namers = NAME_LOCALES.map((locale) => new Intl.DisplayNames([locale], { type: "language" }));
  const describe = (code: string, target: string): void => {
    for (const namer of namers) {
      try {
        registerName(index, namer.of(code), target);
      } catch {
        continue;
      }
    }
  };
  for (const code of SELECTABLE_LANGUAGE_CODES) {
    describe(code, code);
    registerName(index, nativeLanguageName(code), code);
    const base = baseOf(code);
    if (base !== code.toLowerCase() && base !== "zh") {
      const target = selectableTagFor(base) ?? code;
      describe(base, target);
      registerName(index, nativeLanguageName(base), target);
    }
  }
  for (const [alias, code] of NAME_ALIASES) registerName(index, alias, selectableTagFor(code) ?? code);
  return index;
}

const getNameIndex = (): Map<string, string> => (nameIndex ??= buildNameIndex());

function tokensOf(name: string): string[] {
  return name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function matchLatinTokens(lowered: string, index: Map<string, string>): string | null {
  const tokens = tokensOf(lowered);
  const wholeNameIsCode = SHORT_NAME_PATTERN.test(lowered.replace(/[[\]()\s]/g, ""));
  for (let gram = Math.min(MAX_NAME_GRAM, tokens.length); gram >= 1; gram--) {
    for (let start = 0; start + gram <= tokens.length; start++) {
      const phrase = tokens.slice(start, start + gram).join(" ");
      if (gram === 1 && phrase.length <= 2 && !wholeNameIsCode) continue;
      const fromIndex = index.get(phrase) ?? (gram === 1 && phrase.length === 2 ? selectableTagFor(phrase) : undefined);
      if (fromIndex) return fromIndex;
      if (gram === 1 && phrase.length === 3 && tokens.length <= MAX_TOKENS_FOR_ISO_TOKEN && isKnownThreeLetterCode(phrase)) {
        const converted = twoLetterCodeOf(phrase);
        if (converted) return selectableTagFor(converted);
      }
    }
  }
  return null;
}

function matchCjkKeys(lowered: string, index: Map<string, string>): string | null {
  let best: string | null = null;
  let bestLength = 0;
  for (const [key, code] of index) {
    if (key.length >= MIN_CJK_KEY_LENGTH && key.length > bestLength && CJK_PATTERN.test(key) && lowered.includes(key)) {
      best = code;
      bestLength = key.length;
    }
  }
  return best;
}

export function languageFromTrackName(name: string | null): string | null {
  if (!name) return null;
  const lowered = name.normalize("NFKC").toLowerCase();
  if (CANTONESE_HINT.test(lowered)) return selectableTagFor(CANTONESE);
  if (CHINESE_HINT.test(lowered)) return TRADITIONAL_HINT.test(lowered) ? TRADITIONAL : SIMPLIFIED;
  const index = getNameIndex();
  return matchLatinTokens(lowered, index) ?? matchCjkKeys(lowered, index);
}

function languageFromCodes({ language, languageTag }: TrackLanguageMetadata): string | null {
  if (languageTag) {
    const fromTag = selectableTagFor(languageTag);
    if (fromTag) return fromTag;
  }
  const code = language?.trim().toLowerCase();
  if (!code || UNDETERMINED_CODES.has(code)) return null;
  const twoLetter = code.length === 3 ? twoLetterCodeOf(code) : code;
  return twoLetter ? selectableTagFor(twoLetter) : null;
}

function withRegion(language: string | null, metadata: TrackLanguageMetadata): string | null {
  if (!language || language.includes("-")) return language;
  const base = baseOf(language);
  const region = regionFromTag(metadata.languageTag, base) ?? regionFromTrackName(metadata.name, base);
  return region ? `${language}-${region}` : language;
}

export function resolveTrackLanguage(metadata: TrackLanguageMetadata): string | null {
  const fromCodes = languageFromCodes(metadata);
  const fromName = languageFromTrackName(metadata.name);
  if (!fromCodes) return withRegion(fromName, metadata);
  if (fromCodes === SIMPLIFIED && fromName === TRADITIONAL) return TRADITIONAL;
  return withRegion(fromCodes, metadata);
}
