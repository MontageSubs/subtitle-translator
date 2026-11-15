import { escapeHtml } from "../utils/escapeHtml";

const MAX_LINKS_PER_ROW = 5;
const MIN_WIDE_ROW = 3;

export interface LanguageGateLink {
  href: string;
  locale: string;
  label: string;
}

const LANGUAGE_GATE_RULES = [
  ":root{--bg:#faf9f6;--panel:#ffffff;--text:#1c1b19;--line:#e4e0d6;--accent:#b5482f}",
  "@media(prefers-color-scheme:dark){:root{--bg:#16151a;--panel:#1e1d23;--text:#ece9e2;--line:#322f36;--accent:#e18a63}}",
  "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--sans)}",
  ".language-gate{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;padding:24px;box-sizing:border-box;overflow-y:auto;text-align:center;background:var(--bg)}",
  ".language-gate>:first-child{margin-block-start:auto}",
  ".language-gate>:last-child{margin-block-end:auto}",
  ".language-gate h1{font-size:1.5rem;font-weight:600;margin:0 0 24px;letter-spacing:-0.01em;color:var(--text)}",
  ".language-options{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:860px;margin:0}",
  ".language-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;width:100%}",
  ".language-options a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:120px;padding:10px 20px;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-size:0.95rem;font-weight:500;white-space:nowrap}",
  ".language-options a{transition:border-color .15s ease,color .15s ease,background-image .15s ease,scale .08s ease}",
  ".language-options a:hover,.language-options a:focus-visible{border-color:var(--accent);color:var(--accent)}",
  "@media(hover:hover) and (pointer:fine){.language-options a:hover{--tint:color-mix(in srgb,var(--accent) 8%,transparent);background-image:linear-gradient(var(--tint),var(--tint))}}",
  ".language-options a:active{--tint:color-mix(in srgb,var(--accent) 14%,transparent);background-image:linear-gradient(var(--tint),var(--tint));scale:.97}",
  "@media(max-width:640px){.language-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-width:420px}.language-row{display:contents}.language-options a{min-width:0;padding:10px 12px;white-space:normal;text-align:center}.language-options--odd .language-row:last-child a:last-child{grid-column:1/-1;justify-self:center;min-width:calc(50% - 6px)}}",
  "@media(prefers-reduced-motion:reduce){.language-options a{transition:none}.language-options a:active{scale:1}}",
];

export function renderLanguageGateStyle(fontsCss: string): string {
  return [fontsCss.trim(), ...LANGUAGE_GATE_RULES].join("\n        ");
}

function brickRows(count: number, rows: number): number[] | null {
  for (let wide = MAX_LINKS_PER_ROW; wide >= MIN_WIDE_ROW; wide--) {
    for (const startsWide of [true, false]) {
      const sizes = Array.from({ length: rows }, (_, index) => ((index % 2 === 0) === startsWide ? wide : wide - 1));
      if (sizes.reduce((sum, size) => sum + size, 0) === count) return sizes;
    }
  }
  return null;
}

function balancedRows(count: number, rows: number): number[] {
  const sizes = new Array<number>(rows).fill(Math.floor(count / rows));
  const order = [...Array(rows).keys()].sort((a, b) => (a % 2) - (b % 2) || a - b);
  for (let extra = count % rows, index = 0; extra > 0; extra--, index++) sizes[order[index]]++;
  return sizes;
}

export function planLanguageRows(count: number): number[] {
  if (count <= 0) return [];
  if (count <= MAX_LINKS_PER_ROW) return [count];
  const rows = Math.ceil(count / MAX_LINKS_PER_ROW);
  return brickRows(count, rows) ?? balancedRows(count, rows);
}

const LATIN_LABEL = /^[\p{Script=Latin}\p{Script=Common}\p{M}]+$/u;

export function sortGateLocales<T extends { locale: string; label: string }>(entries: readonly T[]): T[] {
  const names = new Intl.DisplayNames(["en"], { type: "language", fallback: "code" });
  const collator = new Intl.Collator("en");
  const englishName = (locale: string): string => names.of(locale.split("-")[0]) ?? locale;
  const isLatin = (entry: T): boolean => LATIN_LABEL.test(entry.label);
  return [...entries].sort((a, b) => {
    if (isLatin(a) !== isLatin(b)) return isLatin(a) ? -1 : 1;
    if (isLatin(a)) return collator.compare(a.label, b.label) || collator.compare(a.locale, b.locale);
    return collator.compare(englishName(a.locale), englishName(b.locale)) || collator.compare(a.locale, b.locale);
  });
}

export function renderLanguageGateOptions(links: readonly LanguageGateLink[], indent = "          "): string {
  const sizes = planLanguageRows(links.length);
  let cursor = 0;
  const rows = sizes.map((size) => {
    const anchors = links
      .slice(cursor, (cursor += size))
      .map(({ href, locale, label }) => `<a href="${escapeHtml(href)}" lang="${locale}" hreflang="${locale}">${escapeHtml(label)}</a>`)
      .join("");
    return `<div class="language-row">${anchors}</div>`;
  });
  const modifier = links.length % 2 === 1 ? " language-options--odd" : "";
  return `<div class="language-options${modifier}">\n${indent}${rows.join(`\n${indent}`)}\n${indent.slice(2)}</div>`;
}
