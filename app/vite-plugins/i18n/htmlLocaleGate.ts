import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { storageKeyOf, type ChannelProfile } from "../../src/config/channelProfile";
import { DEFAULT_LOCALE, LocaleCode } from "../../src/i18n/locales.config";
import { renderLocaleResolver } from "./localeGate";
import { renderLanguageGateOptions, renderLanguageGateStyle, sortGateLocales } from "../../src/render/languageGate";
import { readNativeName } from "./locales";

const LANGUAGE_OPTIONS_MARKER = "<!--i18n:language-options-->";
const LANGUAGE_STYLE_MARKER = "<!--i18n:language-style-->";
const SUPPORTED_MARKER = "__I18N_SUPPORTED__";
const RESOLVER_MARKER = "__I18N_RESOLVER__";
const GATE_FLAG_MARKER = "__I18N_GATE_FLAG__";

export function htmlLocaleGatePlugin(locales: readonly LocaleCode[], channel: ChannelProfile): Plugin {
  const languageOptions = renderLanguageGateOptions(sortGateLocales(locales.map((locale) => ({ locale, label: readNativeName(locale) }))).map(({ locale, label }) => ({ href: `./${locale}/`, locale, label })));
  const languageStyle = renderLanguageGateStyle(readFileSync(resolve(process.cwd(), "src/styles/fonts.css"), "utf8"));
  const resolver = renderLocaleResolver({ supported: locales, fallback: DEFAULT_LOCALE, storageKey: storageKeyOf(channel, "locale") });
  const gateFlag = JSON.stringify(storageKeyOf(channel, "language-gate-redirected"));

  return {
    name: "html-locale-gate",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace(LANGUAGE_STYLE_MARKER, () => languageStyle)
          .replace(LANGUAGE_OPTIONS_MARKER, () => languageOptions)
          .replace(SUPPORTED_MARKER, () => JSON.stringify(locales))
          .replace(RESOLVER_MARKER, () => resolver)
          .replace(GATE_FLAG_MARKER, () => gateFlag),
    },
  };
}
