export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export type StripPluralSuffix<Key extends string> =
  | { [Category in PluralCategory]: Key extends `${infer Base}.${Category}` ? Base : never }[PluralCategory]
  | (Key extends `${string}.${PluralCategory}` ? never : Key);

const PLURAL_SUFFIX = new RegExp(`\\.(${PLURAL_CATEGORIES.join("|")})$`);
const rulesByLocale = new Map<string, Intl.PluralRules>();

function pluralRules(locale: string): Intl.PluralRules {
  let rules = rulesByLocale.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    rulesByLocale.set(locale, rules);
  }
  return rules;
}

export const pluralKey = (baseKey: string, category: PluralCategory): string => `${baseKey}.${category}`;

export const pluralBaseKey = (key: string): string => key.replace(PLURAL_SUFFIX, "");

export const isPluralKey = (key: string): boolean => PLURAL_SUFFIX.test(key);

export const selectPluralCategory = (locale: string, count: number): PluralCategory => pluralRules(locale).select(count) as PluralCategory;

export const pluralCategoriesOf = (locale: string): PluralCategory[] => pluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[];
