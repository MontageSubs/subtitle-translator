import { localeOfDictionaryPath, storeDictionary, type LocaleDictionary } from "../i18n/dictionaries";

const bundled = import.meta.glob<LocaleDictionary>("../i18n/locales/*.json", { eager: true, import: "default" });

for (const [path, dictionary] of Object.entries(bundled)) storeDictionary(localeOfDictionaryPath(path), dictionary);

export { docPages, staticPages } from "virtual:docs-content";
export type { DocPage, StaticPage } from "../types/docs";
export { PAGE_IDS } from '../router/router.pages';
export type { PageId } from '../router/router.pages';
export { DEFAULT_LOCALE } from "../i18n/locales.config";
export { LOCALES } from "../i18n/catalog";
export type { LocaleCode } from "../i18n/locales.config";
export { translate } from "../i18n/dictionaries";
export { TITLE_KEYS, DESCRIPTION_KEYS } from "./metaKeys";
export { renderDocument } from "./documentShell";
export type { ShellContext } from "./shellMarkup";
export { renderDocsListBody, renderDocsDetailBody } from "./docsMarkup";
export { renderStaticPageBody } from "./staticPageMarkup";
export { renderJsRequiredBody } from "./jsRequiredMarkup";
export { buildDocStructuredData, buildTranslatorStructuredData } from "./structuredData";
