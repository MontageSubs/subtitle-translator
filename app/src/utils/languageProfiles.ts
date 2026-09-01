export interface LanguageProfile {
  code: string;
  label: string;
  defaultBilingualWithChinese: boolean;
  maxCharsPerLine: number;
  readingSpeedCps: number;
}

const CJK_CODES = new Set(["zh", "ja", "ko"]);
const LATIN_CODES = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro",
  "cs", "hu", "tr", "id", "vi", "ms", "tl", "ca", "eu", "gl", "la",
]);

function profile(code: string, label: string, defaultBilingualWithChinese = false): LanguageProfile {
  const isCjk = CJK_CODES.has(code);
  const isLatin = LATIN_CODES.has(code);
  const maxCharsPerLine = isCjk ? 16 : 42;
  const readingSpeedCps = isCjk ? 9 : isLatin ? 20 : 17;
  return { code, label, defaultBilingualWithChinese, maxCharsPerLine, readingSpeedCps };
}

const SOURCE_PROFILES: Record<string, LanguageProfile> = {
  en: profile("en", "English", true),
  es: profile("es", "Español"), fr: profile("fr", "Français"),
  de: profile("de", "Deutsch"), it: profile("it", "Italiano"),
  pt: profile("pt", "Português"), nl: profile("nl", "Nederlands"),
  pl: profile("pl", "Polski"), sv: profile("sv", "Svenska"),
  da: profile("da", "Dansk"), no: profile("no", "Norsk"),
  fi: profile("fi", "Suomi"), ro: profile("ro", "Română"),
  cs: profile("cs", "Čeština"), hu: profile("hu", "Magyar"),
  tr: profile("tr", "Türkçe"), id: profile("id", "Indonesia"),
  vi: profile("vi", "Tiếng Việt"), ms: profile("ms", "Melayu"),
  tl: profile("tl", "Tagalog"), ca: profile("ca", "Català"),
  eu: profile("eu", "Euskara"), gl: profile("gl", "Galego"),
  la: profile("la", "Latina"),
  zh: profile("zh", "中文"),
  ja: profile("ja", "日本語", true),
  ko: profile("ko", "한국어"),
  ru: profile("ru", "Русский"), uk: profile("uk", "Українська"), bg: profile("bg", "Български"),
  ar: profile("ar", "العربية"), fa: profile("fa", "فارسی"), ur: profile("ur", "اردو"),
  hi: profile("hi", "हिन्दी"), ne: profile("ne", "नेपाली"), mr: profile("mr", "मराठी"),
  th: profile("th", "ไทย"), he: profile("he", "עברית"), el: profile("el", "Ελληνικά"),
};

const FALLBACK_PROFILE: LanguageProfile = profile("en", "Unknown");

export function languageProfile(code: string | undefined | null): LanguageProfile {
  const key = (code || "en").split("-")[0].toLowerCase();
  return SOURCE_PROFILES[key] || FALLBACK_PROFILE;
}

function isChineseTarget(code: string | undefined | null): boolean {
  return (code || "").split("-")[0].toLowerCase() === "zh";
}

export function defaultOutputMode(sourceLang: string, targetLang: string): "bilingual" | "monolingual" {
  if (!isChineseTarget(targetLang)) return "monolingual";
  return languageProfile(sourceLang).defaultBilingualWithChinese ? "bilingual" : "monolingual";
}

export const AUTO_DETECT_CODE = "auto";

export const TARGET_LANGUAGES: LanguageProfile[] = [
  SOURCE_PROFILES.zh, SOURCE_PROFILES.en,
  profile("es", "Español"),
  SOURCE_PROFILES.ja, SOURCE_PROFILES.ko, SOURCE_PROFILES.fr, SOURCE_PROFILES.de,
  SOURCE_PROFILES.ru, SOURCE_PROFILES.ar, SOURCE_PROFILES.pt,
];

export const SOURCE_LANGUAGES: LanguageProfile[] = Object.values(SOURCE_PROFILES);
