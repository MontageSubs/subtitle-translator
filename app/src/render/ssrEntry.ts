import { localeOfDictionaryPath, storeDictionary, type LocaleDictionary } from "../i18n/dictionaries";
import { namespaced } from "../metadata/namespace";

const bundled = import.meta.glob<LocaleDictionary>("../i18n/locales/*.json", { eager: true, import: "default" });
const bundledMetadata = import.meta.glob<LocaleDictionary>("../metadata/*.json", { eager: true, import: "default" });

const dictionaries = new Map<string, LocaleDictionary>(Object.entries(bundled).map(([path, dictionary]) => [localeOfDictionaryPath(path), dictionary]));
for (const [path, catalog] of Object.entries(bundledMetadata)) {
  const locale = localeOfDictionaryPath(path);
  dictionaries.set(locale, { ...dictionaries.get(locale), ...namespaced(catalog) });
}
for (const [locale, dictionary] of dictionaries) storeDictionary(locale, dictionary);

export { docPages, staticPages } from "virtual:docs-content";
export type { DocPage, StaticPage } from "../types/docs";
export { PAGE_IDS } from '../router/router.pages';
export type { PageId } from '../router/router.pages';
export { DEFAULT_LOCALE } from "../i18n/locales.config";
export { LOCALES } from "../i18n/catalog";
export type { LocaleCode } from "../i18n/locales.config";
export { translate } from "../i18n/dictionaries";
export { metadata } from "../metadata";
export { TITLE_KEYS, pageMetadata, pageOfRoute } from "./metaKeys";
export { PAGE_CRAWL_RESTRICTIONS } from "../config/crawlPolicy";
export { translatedLocales } from "./localeVariants";
export { renderDocument } from "./documentShell";
export type { ShellContext } from "./shellMarkup";
export { renderDocsListBody, renderDocsDetailBody } from "./docsMarkup";
export { renderStaticPageBody } from "./staticPageMarkup";
export { renderJsRequiredBody } from "./jsRequiredMarkup";
export { buildDocStructuredData, buildTranslatorStructuredData } from "./structuredData";
