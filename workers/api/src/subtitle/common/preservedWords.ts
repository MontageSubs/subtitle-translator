const COMMON_TLDS = "com|net|org|io|co|tv|me|app|dev|ai|edu|gov|info|biz|xyz|uk|cn|jp|de|fr|ru|us|ca|au|fm|ly|gg";
const CAPITALIZED_NOUN_LANGUAGES: ReadonlySet<string> = new Set(["de", "lb"]);
const WORD_EDGE_CLASS = "\\p{L}\\p{N}";
const CUE_MARKER = "\\u27e6[^\\u27e6\\u27e7]*\\u27e7";
const ADDRESS_TOKEN = new RegExp(`^(?:https?:\\/\\/|www\\.)|@|\\.(?:${COMMON_TLDS})(?![${WORD_EDGE_CLASS}])`, "iu");
const DOMAIN_CONTINUATION = new RegExp(`^\\.(?:\\s|${CUE_MARKER})*(?:${COMMON_TLDS})(?![${WORD_EDGE_CLASS}])`, "iu");
const DOMAIN_LABEL_BEFORE = new RegExp(`[${WORD_EDGE_CLASS}-]\\.(?:\\s|${CUE_MARKER})*$`, "u");
const SENTENCE_BOUNDARY_BEFORE = new RegExp(`(?:^|[.!?…:\\n])(?:\\s|${CUE_MARKER}|["'“”‘’(\\[])*$`, "u");
const TOP_LEVEL_DOMAIN = new RegExp(`^(?:${COMMON_TLDS})$`, "i");
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const CAPITAL_PATTERN = /^\p{Lu}/u;
const NO_LOWERCASE_PATTERN = /^[^\p{Ll}]+$/u;
const WHITESPACE = /\s/;

function tokenAround(text: string, start: number, end: number): string {
  let from = start;
  let to = end;
  while (from > 0 && !WHITESPACE.test(text[from - 1]!)) from--;
  while (to < text.length && !WHITESPACE.test(text[to]!)) to++;
  return text.slice(from, to);
}

function occursAsPreservedForm(text: string, start: number, end: number, capitalizesNouns: boolean): boolean {
  const occurrence = text.slice(start, end);
  if (occurrence.length >= 2 && NO_LOWERCASE_PATTERN.test(occurrence)) return true;
  if (ADDRESS_TOKEN.test(tokenAround(text, start, end))) return true;
  const after = text.slice(end, end + 48);
  if (DOMAIN_CONTINUATION.test(after)) return true;
  const before = text.slice(Math.max(0, start - 48), start);
  if (TOP_LEVEL_DOMAIN.test(occurrence) && DOMAIN_LABEL_BEFORE.test(before)) return true;
  return !capitalizesNouns && CAPITAL_PATTERN.test(occurrence) && !SENTENCE_BOUNDARY_BEFORE.test(text.slice(0, start));
}

export function isPreservedLatinWord(sourceText: string, word: string, sourceLang: string): boolean {
  const capitalizesNouns = CAPITALIZED_NOUN_LANGUAGES.has(sourceLang.split("-")[0]!.toLowerCase());
  const occurrences = new RegExp(`(?<![${WORD_EDGE_CLASS}])${word.replace(REGEX_SPECIALS, "\\$&")}(?![${WORD_EDGE_CLASS}])`, "giu");
  for (const match of sourceText.matchAll(occurrences)) {
    if (occursAsPreservedForm(sourceText, match.index, match.index + match[0].length, capitalizesNouns)) return true;
  }
  return false;
}
