import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderLanguageGate, renderLanguageGateStyle, sortGateLocales } from "../../src/render/languageGate";

const FONTS_CSS = readFileSync(resolve(process.cwd(), "src/styles/fonts.css"), "utf8");

export interface GateLocale {
  locale: string;
  label: string;
}

export const renderGateStyleBlock = (labels: readonly string[]): string => renderLanguageGateStyle(FONTS_CSS, labels);

export const renderGateBlock = (locales: readonly GateLocale[], hrefOf: (locale: string) => string): string =>
  renderLanguageGate(sortGateLocales(locales).map(({ locale, label }) => ({ href: hrefOf(locale), locale, label })));
