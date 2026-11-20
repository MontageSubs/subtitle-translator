import type { Plugin } from "vite";
import { storageKeyOf, type ChannelProfile } from "../../src/config/channelProfile";
import { DEFAULT_LOCALE, LocaleCode } from "../../src/i18n/locales.config";
import { renderLocaleResolver } from "./localeGate";
import { renderGateBlock, renderGateStyleBlock } from "./languageGateDocument";
import { readNativeName } from "./locales";

const LANGUAGE_GATE_MARKER = "<!--i18n:language-gate-->";
const LANGUAGE_GATE_STYLE_MARKER = "<!--i18n:language-gate-style-->";
const SUPPORTED_MARKER = "__I18N_SUPPORTED__";
const RESOLVER_MARKER = "__I18N_RESOLVER__";
const GATE_FLAG_MARKER = "__I18N_GATE_FLAG__";

export function htmlLocaleGatePlugin(locales: readonly LocaleCode[], channel: ChannelProfile): Plugin {
  const gateBlock = renderGateBlock(locales.map((locale) => ({ locale, label: readNativeName(locale) })), (locale) => `./${locale}/`);
  const gateStyleBlock = renderGateStyleBlock(locales.map(readNativeName));
  const resolver = renderLocaleResolver({ supported: locales, fallback: DEFAULT_LOCALE, storageKey: storageKeyOf(channel, "locale") });
  const gateFlag = JSON.stringify(storageKeyOf(channel, "language-gate-redirected"));

  return {
    name: "html-locale-gate",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace(LANGUAGE_GATE_STYLE_MARKER, () => gateStyleBlock)
          .replace(LANGUAGE_GATE_MARKER, () => gateBlock)
          .replace(SUPPORTED_MARKER, () => JSON.stringify(locales))
          .replace(RESOLVER_MARKER, () => resolver)
          .replace(GATE_FLAG_MARKER, () => gateFlag),
    },
  };
}
