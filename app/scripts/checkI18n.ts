import { runInNewContext } from "node:vm";
import { DEFAULT_LOCALE, LocaleCode } from "../src/i18n/locales.config";
import { matchPreferredLocale } from "../src/i18n/negotiate";
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

const placeholdersOf = (text: string): string => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");

function auditLocale(locale: LocaleCode, reference: Dictionary, requiredKeys: string[]): LocaleReport {
  const report: LocaleReport = { locale, missing: [], extra: [], errors: [] };
  let dictionary: Record<string, unknown>;
  try {
    dictionary = readLocaleDictionary(locale);
  } catch (error) {
    report.errors.push(`${locale}.json: ${(error as Error).message}`);
    return report;
  }
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value !== "string") report.errors.push(`${locale}: "${key}" must be a string`);
    else if (!(key in reference)) report.extra.push(key);
    else if (value && placeholdersOf(value) !== placeholdersOf(reference[key])) report.errors.push(`${locale}: "${key}" placeholders differ from ${DEFAULT_LOCALE}`);
  }
  report.missing = requiredKeys.filter((key) => !dictionary[key]);
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

function printCoverage(reports: LocaleReport[], requiredCount: number): void {
  console.log(`\ni18n status (${requiredCount} required keys in ${DEFAULT_LOCALE}.json):\n`);
  for (const { locale, missing, extra } of reports) {
    const percentage = Math.round(((requiredCount - missing.length) / requiredCount) * 100);
    console.log(`  [${locale.padEnd(8)}] ${missing.length ? `${percentage}% (${missing.length} missing)` : "100%"}${extra.length ? ` · ${extra.length} unknown keys` : ""}`);
  }
  console.log("");
}

function main(): number {
  const reference = readLocaleDictionary(DEFAULT_LOCALE) as Dictionary;
  const requiredKeys = Object.keys(reference).filter((key) => !key.startsWith(OPTIONAL_KEY_PREFIX));
  const reports = discoverLocales().map((locale) => auditLocale(locale, reference, requiredKeys));
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

  printCoverage(translations, requiredKeys.length);
  errors.forEach((message) => console.error(`error: ${message}`));
  return errors.length ? 1 : 0;
}

process.exitCode = main();
