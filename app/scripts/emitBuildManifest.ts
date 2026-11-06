import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildChannel } from "../vite-plugins/channel";
import { discoverLocales } from "../vite-plugins/i18n/locales";

const CHANNEL = resolveBuildChannel(process.env);
const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", CHANNEL.outDir);
const EXCLUDED = /(?:^|\/)(?:sw\.js|build\.json|sitemap\.xml|robots\.txt|announcement-feed\.json)$|\.map$|^announcement-feed\/[^/]+\.json$/;
const CHUNK_HASH_PATTERN = "[\\w-]{8}";
const PACK_HASH_PATTERN = "[0-9a-f]{8}";
const ON_DEMAND_CHUNKS = [
  { group: "segmenter:chinese", chunk: "segmentit", extension: "js" },
  { group: "detector:language", chunk: "static.small", extension: "js" },
  { group: "runtime:models", chunk: "modelRuntime", extension: "js" },
] as const;
const PRERENDERED_PAGE = /\.html$/;

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex").slice(0, 16);
const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const groupPatterns = [
  ...discoverLocales().map((code) => ({
    group: `locale:${code}`,
    pattern: new RegExp(`^(?:${escapePattern(code)}/|locales/${escapePattern(code)}\\.${PACK_HASH_PATTERN}\\.json$)`),
  })),
  ...ON_DEMAND_CHUNKS.map(({ group, chunk, extension }) => ({
    group,
    pattern: new RegExp(`^assets/${escapePattern(chunk)}-${CHUNK_HASH_PATTERN}\\.${extension}$`),
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

const manifest = { files, groups };
const withoutPages = (record: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(record).filter(([path]) => !PRERENDERED_PAGE.test(path)));
const appIdentity = {
  files: withoutPages(files),
  groups: Object.fromEntries(Object.entries(groups).map(([group, record]) => [group, withoutPages(record)])),
};

const identity = { channel: CHANNEL.id, buildId: CHANNEL.buildId, basePath: CHANNEL.basePath, cacheName: CHANNEL.cacheName };

writeFileSync(resolve(DIST_DIR, "build.json"), JSON.stringify({ digest: sha256(JSON.stringify(appIdentity)), revision: sha256(JSON.stringify(manifest)), version: CHANNEL.version, ...identity, ...manifest }));
