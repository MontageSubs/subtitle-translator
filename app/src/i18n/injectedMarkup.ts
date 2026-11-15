const MARKUP_PATTERN = /<\/?[a-z!][^>]*>|&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);|javascript:|\bon[a-z]+\s*=|"\s*[a-z-]+\s*=/i;

export const hasMarkup = (text: string): boolean => MARKUP_PATTERN.test(text);

export const isInjectedMarkup = (translation: string, original: string | undefined): boolean => hasMarkup(translation) && !hasMarkup(original ?? "");

export function withoutInjectedMarkup<Dictionary extends Readonly<Record<string, string>>>(dictionary: Dictionary, reference: Readonly<Record<string, string>>): Dictionary {
  const entries = Object.entries(dictionary);
  if (!entries.some(([key, value]) => isInjectedMarkup(value, reference[key]))) return dictionary;
  return Object.fromEntries(entries.filter(([key, value]) => !isInjectedMarkup(value, reference[key]))) as Dictionary;
}
