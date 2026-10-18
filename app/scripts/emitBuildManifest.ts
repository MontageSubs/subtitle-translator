import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverLocales } from "../vite-plugins/i18n/locales";

const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const EXCLUDED = /(?:^|\/)(?:sw\.js|build\.json|sitemap\.xml|robots\.txt)$|\.map$/;
const OPTIONAL_MIN_BYTES = 512 * 1024;
const CHUNK_HASH_PATTERN = "[\\w-]{8}";

const APP_VERSION_PATTERN = /<meta name="app-version" content="([^"]+)"/;

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex").slice(0, 16);
const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const localePatterns = discoverLocales().map((code) => ({
  code,
  pattern: new RegExp(`^(?:${escapePattern(code)}/|manifest\\.${escapePattern(code)}\\.webmanifest$|assets/${escapePattern(code)}-${CHUNK_HASH_PATTERN}\\.js$)`),
}));

const localeOf = (path: string): string | undefined => localePatterns.find(({ pattern }) => pattern.test(path))?.code;

const core: Record<string, string> = {};
const optional: Record<string, string> = {};
const locales: Record<string, Record<string, string>> = {};

for (const entry of readdirSync(DIST_DIR, { recursive: true, encoding: "utf8" }).map((path) => path.split(sep).join("/")).sort()) {
  const file = resolve(DIST_DIR, entry);
  if (EXCLUDED.test(entry) || !statSync(file).isFile()) continue;
  const hash = sha256(readFileSync(file));
  const locale = localeOf(entry);
  if (locale) (locales[locale] ??= {})[entry] = hash;
  else if (statSync(file).size >= OPTIONAL_MIN_BYTES) optional[entry] = hash;
  else core[entry] = hash;
}

const version = APP_VERSION_PATTERN.exec(readFileSync(resolve(DIST_DIR, "index.html"), "utf8"))?.[1];
const manifest = { files: core, optional, locales };

writeFileSync(resolve(DIST_DIR, "build.json"), JSON.stringify({ digest: sha256(JSON.stringify(manifest)), version, ...manifest }));
