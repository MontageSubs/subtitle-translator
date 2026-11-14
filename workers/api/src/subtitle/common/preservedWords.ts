const COMMON_TLDS = "com|net|org|io|co|tv|me|app|dev|ai|edu|gov|info|biz|xyz|uk|cn|jp|de|fr|ru|us|ca|au|fm|ly|gg";
const CAPITALIZED_NOUN_LANGUAGES: ReadonlySet<string> = new Set(["de", "lb"]);
const WORD_CHARS = "\\p{L}\\p{N}'’";

const PRESERVED_SOURCE_PATTERN = new RegExp(
  [
    `(?<url>(?:https?:\\/\\/|www\\.)[^\\s<>]+|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${COMMON_TLDS})\\b)`,
    `(?<boundary>[.!?…:]["”’)\\]]*\\s+|\\n)`,
    `(?<word>[\\p{L}][${WORD_CHARS}]*)`,
  ].join("|"),
  "giu"
);
const URL_WORD_PATTERN = /[\p{L}\p{N}]{2,}/gu;
const CAPITAL_PATTERN = /^\p{Lu}/u;
const NO_LOWERCASE_PATTERN = /^[^\p{Ll}]+$/u;

export function preservedLatinWords(sourceText: string, sourceLang: string): ReadonlySet<string> {
  const preserved = new Set<string>();
  const capitalizesNouns = CAPITALIZED_NOUN_LANGUAGES.has(sourceLang.split("-")[0].toLowerCase());
  let atSentenceStart = true;
  for (const { groups } of sourceText.matchAll(PRESERVED_SOURCE_PATTERN)) {
    if (groups!.url) {
      for (const [part] of groups!.url.matchAll(URL_WORD_PATTERN)) preserved.add(part.toLowerCase());
      atSentenceStart = false;
    } else if (groups!.boundary) {
      atSentenceStart = true;
    } else {
      const word = groups!.word!;
      const acronym = word.length >= 2 && NO_LOWERCASE_PATTERN.test(word);
      if (acronym || (!capitalizesNouns && !atSentenceStart && CAPITAL_PATTERN.test(word))) preserved.add(word.toLowerCase());
      atSentenceStart = false;
    }
  }
  return preserved;
}
