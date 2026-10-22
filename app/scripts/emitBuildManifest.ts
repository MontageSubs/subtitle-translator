import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverLocales } from "../vite-plugins/i18n/locales";

const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const EXCLUDED = /(?:^|\/)(?:sw\.js|build\.json|sitemap\.xml|robots\.txt|announcement\.json)$|\.map$|^announcement\/[^/]+\.json$/;
const CHUNK_HASH_PATTERN = "[\\w-]{8}";
const ON_DEMAND_CHUNKS = [
  { group: "segmenter:chinese", chunk: "segmentit" },
  { group: "detector:language", chunk: "static.small" },
] as const;
const PRERENDERED_PAGE = /\.html$/;
const APP_VERSION_PATTERN = /<meta name="app-version" content="([^"]+)"/;

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex").slice(0, 16);
const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const groupPatterns = [
  ...discoverLocales().map((code) => ({
    group: `locale:${code}`,
    pattern: new RegExp(`^(?:${escapePattern(code)}/|assets/${escapePattern(code)}-${CHUNK_HASH_PATTERN}\\.js$)`),
  })),
  ...ON_DEMAND_CHUNKS.map(({ group, chunk }) => ({
    group,
    pattern: new RegExp(`^assets/${escapePattern(chunk)}-${CHUNK_HASH_PATTERN}\\.js$`),
  })),
];

const groupOf = (path: string): string | undefined => groupPatterns.find(({ pattern }) => pattern.test(path))?.group;

const files: Record<string, string> = {};
const groups: Record<string, Record<string, string>> = {};

for (const entry of readdirSync(DIST_DIR, { recursive: true, encoding: "utf8" }).map((path) => path.split(sep).join("/")).sort()) {
  const file = resolve(DIST_DIR, entry);
  if (EXCLUDED.test(entry) || !statSync(file).isFile()) continue;
  const hash = sha256(readFileSync(file));
  const group = groupOf(entry);
  if (group) (groups[group] ??= {})[entry] = hash;
  else files[entry] = hash;
}

for (const { group } of ON_DEMAND_CHUNKS) if (!groups[group]) throw new Error(`on-demand group "${group}" matched no build output`);

const version = APP_VERSION_PATTERN.exec(readFileSync(resolve(DIST_DIR, "index.html"), "utf8"))?.[1];
const manifest = { files, groups };
const withoutPages = (record: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(record).filter(([path]) => !PRERENDERED_PAGE.test(path)));
const appIdentity = {
  files: withoutPages(files),
  groups: Object.fromEntries(Object.entries(groups).map(([group, record]) => [group, withoutPages(record)])),
};

writeFileSync(resolve(DIST_DIR, "build.json"), JSON.stringify({ digest: sha256(JSON.stringify(appIdentity)), revision: sha256(JSON.stringify(manifest)), version, ...manifest }));
