import type { Plugin } from "vite";
import { storageKeyOf, type ChannelProfile } from "../../src/config/channelProfile";
import { DEFAULT_LOCALE, LocaleCode } from "../../src/i18n/locales.config";
import { renderLocaleResolver } from "./localeGate";
import { readNativeName } from "./locales";

const ALTERNATES_MARKER = "<!--i18n:alternates-->";
const LANGUAGE_OPTIONS_MARKER = "<!--i18n:language-options-->";
const SUPPORTED_MARKER = "__I18N_SUPPORTED__";
const RESOLVER_MARKER = "__I18N_RESOLVER__";
const GATE_FLAG_MARKER = "__I18N_GATE_FLAG__";

export function htmlLocaleGatePlugin(locales: readonly LocaleCode[], channel: ChannelProfile): Plugin {
  const hrefFor = (locale: LocaleCode) => `./${locale}/`;
  const alternates = [
    ...locales.map((locale) => `<link rel="alternate" hreflang="${locale}" href="${hrefFor(locale)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${hrefFor(DEFAULT_LOCALE)}" />`,
  ].join("\n    ");
  const languageOptions = locales
    .map((locale) => `<a href="./${locale}/" lang="${locale}" hreflang="${locale}">${readNativeName(locale)}</a>`)
    .join("\n          ");
  const resolver = renderLocaleResolver({ supported: locales, fallback: DEFAULT_LOCALE, storageKey: storageKeyOf(channel, "locale") });
  const gateFlag = JSON.stringify(storageKeyOf(channel, "language-gate-redirected"));

  return {
    name: "html-locale-gate",
    transformIndexHtml: (html) =>
      html
        .replace(ALTERNATES_MARKER, () => alternates)
        .replace(LANGUAGE_OPTIONS_MARKER, () => languageOptions)
        .replace(SUPPORTED_MARKER, () => JSON.stringify(locales))
        .replace(RESOLVER_MARKER, () => resolver)
        .replace(GATE_FLAG_MARKER, () => gateFlag),
  };
}
