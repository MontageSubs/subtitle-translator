import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderLanguageGate, renderLanguageGateStyle, sortGateLocales } from "../../src/render/languageGate";

const FONT_VARIABLES_BLOCK = /:root\s*\{([^}]*)\}/;
const CUSTOM_PROPERTY = /(--[\w-]+)\s*:\s*([^;]+);/g;
const VARIABLE_REFERENCE = /var\((--[\w-]+)\)/g;

function resolveSansFontFamily(fontsCss: string): string {
  const properties = new Map([...(FONT_VARIABLES_BLOCK.exec(fontsCss)?.[1] ?? "").matchAll(CUSTOM_PROPERTY)].map(([, name, value]) => [name, value.trim()]));
  const expand = (value: string): string =>
    value.replace(VARIABLE_REFERENCE, (_, name: string) => {
      const referenced = properties.get(name);
      if (referenced === undefined) throw new Error(`fonts.css is missing ${name}`);
      return expand(referenced);
    });
  const emojiFamily = expand("var(--emoji)");
  const families = expand("var(--sans)").split(",").map((family) => family.trim()).filter((family) => family !== emojiFamily);
  return [...new Set(families)].join(",");
}

const SANS_FONT_FAMILY = resolveSansFontFamily(readFileSync(resolve(process.cwd(), "src/styles/fonts.css"), "utf8"));

export interface GateLocale {
  locale: string;
  label: string;
}

export const renderGateStyleBlock = (labels: readonly string[]): string => renderLanguageGateStyle(SANS_FONT_FAMILY, labels);

export const renderGateBlock = (locales: readonly GateLocale[], hrefOf: (locale: string) => string): string =>
  renderLanguageGate(sortGateLocales(locales).map(({ locale, label }) => ({ href: hrefOf(locale), locale, label })));
