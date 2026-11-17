import { escapeHtml } from "../utils/escapeHtml";

const STAGGER_PENALTY = 10;
const LONELY_LAST_ROW_PENALTY = 15;

interface GateBreakpoint {
  maxPerRow: number;
  minWidth: number;
}

const GATE_BREAKPOINTS: readonly GateBreakpoint[] = [
  { maxPerRow: 5, minWidth: 860 },
  { maxPerRow: 4, minWidth: 700 },
  { maxPerRow: 3, minWidth: 520 },
  { maxPerRow: 2, minWidth: 340 },
  { maxPerRow: 1, minWidth: 0 },
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
  ".language-gate>:first-child{margin-block-start:auto}",
  ".language-gate>:last-child{margin-block-end:auto}",
  ".language-gate h1{font-size:1.5rem;font-weight:600;margin:0 0 24px;letter-spacing:-0.01em;color:var(--text)}",
  ".language-options{display:none;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:860px;margin:0}",
  ".language-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;width:100%}",
  ".language-options a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:112px;max-width:100%;padding:10px 20px;white-space:normal;text-align:center;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-size:0.95rem;font-weight:500}",
  ".language-options a{transition:border-color .15s ease,color .15s ease,background-image .15s ease,scale .08s ease}",
  ".language-options a:hover,.language-options a:focus-visible{border-color:var(--accent);color:var(--accent)}",
  "@media(hover:hover) and (pointer:fine){.language-options a:hover{--tint:color-mix(in srgb,var(--accent) 8%,transparent);background-image:linear-gradient(var(--tint),var(--tint))}}",
  ".language-options a:active{--tint:color-mix(in srgb,var(--accent) 14%,transparent);background-image:linear-gradient(var(--tint),var(--tint));scale:.97}",
  ...[...GATE_BREAKPOINTS].sort((a, b) => a.minWidth - b.minWidth).map(({ maxPerRow, minWidth }) => minWidth === 0 ? `.language-options[data-max~="${maxPerRow}"]{display:flex}` : `@media(min-width:${minWidth}px){.language-options[data-max]{display:none}.language-options[data-max~="${maxPerRow}"]{display:flex}}`),
  "@media(prefers-reduced-motion:reduce){.language-options a{transition:none}.language-options a:active{scale:1}}",
];

export function renderLanguageGateStyle(fontsCss: string): string {
  return [fontsCss.trim(), ...LANGUAGE_GATE_RULES].join("\n        ");
}

interface RowPlan {
  cost: number;
  sizes: number[];
}

function cheapestStaggeredPlan(count: number, rows: number, maxPerRow: number): number[] | null {
  const memo = new Map<string, RowPlan | null>();
  const search = (index: number, remaining: number, previous: number): RowPlan | null => {
    const key = `${index}:${remaining}:${previous}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const rowsAfter = rows - index - 1;
    let best: RowPlan | null = null;
    for (let size = Math.min(maxPerRow, remaining); size >= 1; size--) {
      const left = remaining - size;
      if (size === previous || left < rowsAfter || left > rowsAfter * maxPerRow) continue;
      const tail = rowsAfter === 0 ? { cost: 0, sizes: [] } : search(index + 1, left, size);
      if (!tail) continue;
      const stagger = previous === 0 ? 0 : STAGGER_PENALTY * (Math.abs(size - previous) - 1);
      const lonely = rowsAfter === 0 && size === 1 && rows > 1 ? LONELY_LAST_ROW_PENALTY : 0;
      const cost = tail.cost + stagger + lonely;
      if (best === null || cost < best.cost) best = { cost, sizes: [size, ...tail.sizes] };
    }
    memo.set(key, best);
    return best;
  };
  return search(0, count, 0)?.sizes ?? null;
}

export function planLanguageRows(count: number, maxPerRow: number): number[] {
  if (count <= 0) return [];
  if (count <= maxPerRow) return [count];
  if (maxPerRow <= 1) return new Array<number>(count).fill(1);
  for (let rows = Math.ceil(count / maxPerRow); rows <= count; rows++) {
    const plan = cheapestStaggeredPlan(count, rows, maxPerRow);
    if (plan) return plan;
  }
  return new Array<number>(count).fill(1);
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

function renderRows(links: readonly LanguageGateLink[], sizes: readonly number[], indent: string): string {
  let cursor = 0;
  return sizes
    .map((size) => {
      const anchors = links
        .slice(cursor, (cursor += size))
        .map(({ href, locale, label }) => `<a href="${escapeHtml(href)}" lang="${locale}" hreflang="${locale}">${escapeHtml(label)}</a>`)
        .join("");
      return `${indent}  <div class="language-row">${anchors}</div>`;
    })
    .join("\n");
}

export function renderLanguageGateOptions(links: readonly LanguageGateLink[], indent = "        "): string {
  const variants = new Map<string, number[]>();
  for (const { maxPerRow } of GATE_BREAKPOINTS) {
    const sizes = planLanguageRows(links.length, maxPerRow);
    const key = sizes.join("-");
    variants.set(key, [...(variants.get(key) ?? []), maxPerRow]);
  }
  return [...variants]
    .map(([key, widths]) => `${indent}<div class="language-options" data-max="${widths.join(" ")}">\n${renderRows(links, key.split("-").map(Number), indent)}\n${indent}</div>`)
    .join("\n")
    .trimStart();
}
