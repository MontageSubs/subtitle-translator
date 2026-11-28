import type { Plugin } from "vite";
import { storageKeyOf, type ChannelProfile } from "../../src/config/channelProfile";
import { DEFAULT_LOCALE, LocaleCode } from "../../src/i18n/locales.config";
import { renderLocaleResolver } from "./localeGate";
import { renderRootGateScript } from "./gateScripts";
import { renderGateBlock, renderGateStyleBlock } from "./languageGateDocument";
import { readNativeName } from "./locales";

const LANGUAGE_GATE_MARKER = "<!--i18n:language-gate-->";
const LANGUAGE_GATE_STYLE_MARKER = "<!--i18n:language-gate-style-->";
const LANGUAGE_GATE_SCRIPT_MARKER = "<!--i18n:gate-script-->";

export function htmlLocaleGatePlugin(locales: readonly LocaleCode[], channel: ChannelProfile): Plugin {
  const gateBlock = renderGateBlock(locales.map((locale) => ({ locale, label: readNativeName(locale) })), (locale) => `./${locale}/`);
  const gateStyleBlock = renderGateStyleBlock(locales.map(readNativeName));
  const gateScript = renderRootGateScript({
    supported: locales,
    resolver: renderLocaleResolver({ supported: locales, fallback: DEFAULT_LOCALE, storageKey: storageKeyOf(channel, "locale"), seenMatchKey: storageKeyOf(channel, "locale-seen-match") }),
    flagKey: storageKeyOf(channel, "language-gate-redirected"),
  });

  return {
    name: "html-locale-gate",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace(LANGUAGE_GATE_SCRIPT_MARKER, () => gateScript)
          .replace(LANGUAGE_GATE_STYLE_MARKER, () => gateStyleBlock)
          .replace(LANGUAGE_GATE_MARKER, () => gateBlock),
    },
  };
}
