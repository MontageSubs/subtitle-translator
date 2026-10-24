import { runInNewContext } from "node:vm";
import { DEFAULT_LOCALE, LocaleCode } from "../src/i18n/locales.config";
import { matchPreferredLocale } from "../src/i18n/negotiate";
import { isPluralKey, pluralBaseKey, pluralCategoriesOf, pluralKey } from "../src/i18n/plural";
import { renderLocaleResolver } from "../vite-plugins/i18n/localeGate";
import { discoverLocales, isLocaleFile, localeFileNames, readLocaleDictionary } from "../vite-plugins/i18n/locales";

type Dictionary = Record<string, string>;

interface LocaleReport {
  locale: LocaleCode;
  missing: string[];
  extra: string[];
  errors: string[];
}

const OPTIONAL_KEY_PREFIX = "language.name.";
const GATE_SAMPLE_TAGS = ["", "en", "en-GB", "EN_us", "zh", "zh-CN", "zh-TW", "zh-Hant-HK", "zh_cht", "pt-BR", "pt-PT", "nb", "no", "sr-Latn-RS", "fr-CA", "ja", "xx-YY"];

const placeholdersOf = (text: string, ignoredName?: string): string =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).filter((name) => name !== ignoredName).sort().join(",");

function groupKeys(reference: Dictionary): Map<string, boolean> {
  const groups = new Map<string, boolean>();
  for (const key of Object.keys(reference)) groups.set(pluralBaseKey(key), isPluralKey(key) || groups.get(pluralBaseKey(key)) === true);
  return groups;
}

function requiredKeysFor(locale: LocaleCode, groups: Map<string, boolean>): string[] {
  return [...groups]
    .filter(([base]) => !base.startsWith(OPTIONAL_KEY_PREFIX))
    .flatMap(([base, plural]) => (plural ? pluralCategoriesOf(locale).map((category) => pluralKey(base, category)) : [base]));
}

function referenceTextFor(reference: Dictionary, key: string): string | undefined {
  return reference[key] ?? reference[pluralKey(pluralBaseKey(key), "other")];
}

function auditLocale(locale: LocaleCode, reference: Dictionary, groups: Map<string, boolean>): LocaleReport {
  const report: LocaleReport = { locale, missing: [], extra: [], errors: [] };
  let dictionary: Record<string, unknown>;
  try {
    dictionary = readLocaleDictionary(locale);
  } catch (error) {
    report.errors.push(`${locale}.json: ${(error as Error).message}`);
    return report;
  }
  for (const [key, value] of Object.entries(dictionary)) {
    const expected = referenceTextFor(reference, key);
    const plural = isPluralKey(key) && groups.get(pluralBaseKey(key)) === true;
    if (typeof value !== "string") report.errors.push(`${locale}: "${key}" must be a string`);
    else if (expected === undefined || (isPluralKey(key) && !plural)) report.extra.push(key);
    else if (value && placeholdersOf(value, plural ? "count" : undefined) !== placeholdersOf(expected, plural ? "count" : undefined)) {
      report.errors.push(`${locale}: "${key}" placeholders differ from ${DEFAULT_LOCALE}`);
    }
  }
  const keys = Object.keys(dictionary);
  if (keys.some((key, index) => index > 0 && key < keys[index - 1]!)) report.errors.push(`${locale}.json: keys must be sorted alphabetically`);
  report.missing = requiredKeysFor(locale, groups).filter((key) => !dictionary[key]);
  return report;
}

function auditGateParity(): string[] {
  const supportedSets = [discoverLocales(), ["en", "zh-Hans", "zh-Hant", "pt-BR", "pt-PT", "nb", "sr-Cyrl", "sr-Latn", "ar", "fil"]];
  return supportedSets.flatMap((supported) =>
    GATE_SAMPLE_TAGS.flatMap((tag) => {
      const resolver = renderLocaleResolver({ supported, fallback: DEFAULT_LOCALE, storageKey: "locale" });
      const gate = runInNewContext(resolver, { navigator: { languages: [tag] }, localStorage: { getItem: () => null } });
      const runtime = matchPreferredLocale([tag], supported, DEFAULT_LOCALE);
      return gate === runtime ? [] : [`gate/runtime mismatch for "${tag}" in [${supported}]: ${gate} vs ${runtime}`];
    }),
  );
}

function printCoverage(reports: LocaleReport[], groups: Map<string, boolean>): void {
  console.log(`\ni18n status (${groups.size} keys in ${DEFAULT_LOCALE}.json):\n`);
  for (const { locale, missing, extra } of reports) {
    const requiredCount = requiredKeysFor(locale, groups).length;
    const percentage = Math.round(((requiredCount - missing.length) / requiredCount) * 100);
    console.log(`  [${locale.padEnd(8)}] ${missing.length ? `${percentage}% (${missing.length} missing)` : "100%"}${extra.length ? ` · ${extra.length} unknown keys` : ""}`);
  }
  console.log("");
}

function main(): number {
  const reference = readLocaleDictionary(DEFAULT_LOCALE) as Dictionary;
  const groups = groupKeys(reference);
  const reports = discoverLocales().map((locale) => auditLocale(locale, reference, groups));
  const translations = reports.filter(({ locale }) => locale !== DEFAULT_LOCALE);

  const templateIndex = process.argv.indexOf("--template");
  if (templateIndex !== -1) {
    const target = translations.find(({ locale }) => locale === process.argv[templateIndex + 1]);
    if (!target) {
      console.error(`Unknown locale "${process.argv[templateIndex + 1]}"`);
      return 1;
    }
    console.log(JSON.stringify(Object.fromEntries(target.missing.map((key) => [key, ""])), null, 2));
    return 0;
  }

  const errors = [
    ...localeFileNames().filter((file) => !isLocaleFile(file)).map((file) => `${file}: file name must be a canonical BCP 47 tag such as "pt-BR" or "zh-Hant"`),
    ...reports.flatMap((report) => report.errors),
    ...auditGateParity(),
  ];

  printCoverage(translations, groups);
  errors.forEach((message) => console.error(`error: ${message}`));
  return errors.length ? 1 : 0;
}

process.exitCode = main();
