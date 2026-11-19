import { escapeHtml } from "../utils/escapeHtml";

const GATE_GAP = 12;
const GATE_TITLE = "Select Language";

interface GateBreakpoint {
  maxPerRow: number;
  minWidth: number;
}

const GATE_BREAKPOINTS: readonly GateBreakpoint[] = [
  { maxPerRow: 2, minWidth: 340 },
  { maxPerRow: 3, minWidth: 520 },
  { maxPerRow: 4, minWidth: 700 },
  { maxPerRow: 5, minWidth: 860 },
];

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
  '.language-gate::before,.language-gate::after{content:"";flex:1 0 0}',
  ".language-gate>*{flex-shrink:0}",
  ".language-gate h1{font-size:1.5rem;font-weight:600;margin:0 0 24px;letter-spacing:-0.01em;color:var(--text)}",
  `.language-options{display:flex;flex-direction:column;align-items:center;gap:${GATE_GAP}px;width:100%;max-width:860px;margin:0;padding:0;list-style:none}`,
  ".language-options li{display:flex;min-width:0;max-width:100%}",
  ".language-options a{display:inline-flex;flex:1;align-items:center;justify-content:center;box-sizing:border-box;min-width:112px;max-width:100%;padding:10px 20px;white-space:normal;overflow-wrap:anywhere;text-align:center;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-size:0.95rem;font-weight:500}",
  ".language-options a{transition:border-color .15s ease,color .15s ease,background-image .15s ease,scale .08s ease}",
  ".language-options a:hover,.language-options a:focus-visible{border-color:var(--accent);color:var(--accent)}",
  "@media(hover:hover) and (pointer:fine){.language-options a:hover{--tint:color-mix(in srgb,var(--accent) 8%,transparent);background-image:linear-gradient(var(--tint),var(--tint))}}",
  ".language-options a:active{--tint:color-mix(in srgb,var(--accent) 14%,transparent);background-image:linear-gradient(var(--tint),var(--tint));scale:.97}",
  "@media(prefers-reduced-motion:reduce){.language-options a{transition:none}.language-options a:active{scale:1}}",
];

function alternatingRowPlan(count: number, firstRowSize: number, maxPerRow: number): number[] | null {
  const sizes: number[] = [];
  let remaining = count;
  let expected = firstRowSize;
  while (remaining > 0) {
    const size = Math.min(expected, remaining);
    if (size === sizes[sizes.length - 1]) return null;
    sizes.push(size);
    remaining -= size;
    expected = expected === maxPerRow ? maxPerRow - 1 : maxPerRow;
  }
  return sizes;
}

function rowPlanRank(sizes: readonly number[], maxPerRow: number): number {
  const lonelyLastRow = maxPerRow > 2 && sizes.length > 1 && sizes[sizes.length - 1] === 1;
  return (lonelyLastRow ? sizes.length * maxPerRow : 0) + sizes.length;
}

export function planLanguageRows(count: number, maxPerRow: number): number[] {
  if (count <= 0) return [];
  if (count <= maxPerRow) return [count];
  if (maxPerRow <= 1) return new Array<number>(count).fill(1);
  const plans = [maxPerRow, maxPerRow - 1]
    .map((firstRowSize) => alternatingRowPlan(count, firstRowSize, maxPerRow))
    .filter((plan): plan is number[] => plan !== null);
  return plans.reduce((best, plan) => (rowPlanRank(plan, maxPerRow) < rowPlanRank(best, maxPerRow) ? plan : best));
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

function rowStartColumns(count: number, maxPerRow: number): Map<number, number[]> {
  const itemsByStartColumn = new Map<number, number[]>();
  let firstItem = 1;
  for (const size of planLanguageRows(count, maxPerRow)) {
    const startColumn = maxPerRow - size + 1;
    itemsByStartColumn.set(startColumn, [...(itemsByStartColumn.get(startColumn) ?? []), firstItem]);
    firstItem += size;
  }
  return itemsByStartColumn;
}

const itemSelector = (items: readonly number[]): string => items.map((item) => `.language-options li:nth-child(${item})`).join(",");

export function renderLanguageGateStyle(fontsCss: string, localeCount: number): string {
  const placedItems = new Set<number>();
  const gridRules = GATE_BREAKPOINTS.map(({ maxPerRow, minWidth }) => {
    const startColumns = rowStartColumns(localeCount, maxPerRow);
    const rowFirstItems = new Set([...startColumns.values()].flat());
    const releasedItems = [...placedItems].filter((item) => !rowFirstItems.has(item));
    rowFirstItems.forEach((item) => placedItems.add(item));
    const rules = [
      `.language-options{display:grid;grid-template-columns:repeat(${maxPerRow * 2},minmax(0,1fr));align-items:stretch;gap:${GATE_GAP}px}`,
      ".language-options li{grid-column:span 2}",
      ...(releasedItems.length ? [`${itemSelector(releasedItems)}{grid-column:span 2}`] : []),
      ...[...startColumns].map(([startColumn, items]) => `${itemSelector(items)}{grid-column:${startColumn}/span 2}`),
    ];
    return `@media(min-width:${minWidth}px){${rules.join("")}}`;
  });
  return `<noscript>\n    <style>\n${[fontsCss.trim(), ...LANGUAGE_GATE_RULES, ...gridRules].join("\n")}\n    </style>\n  </noscript>`;
}

export function renderLanguageGate(links: readonly LanguageGateLink[]): string {
  const items = links
    .map(({ href, locale, label }) => `<li><a href="${escapeHtml(href)}" lang="${locale}" hreflang="${locale}">${escapeHtml(label)}</a></li>`)
    .join("\n        ");
  return `<noscript>\n    <div class="language-gate">\n      <h1>${GATE_TITLE}</h1>\n      <ul class="language-options">\n        ${items}\n      </ul>\n    </div>\n  </noscript>`;
}
