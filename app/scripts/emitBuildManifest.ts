import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const EXCLUDED = /(?:^|\/)(?:sw\.js|build\.json|sitemap\.xml|robots\.txt)$|\.map$/;

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex").slice(0, 16);

const files = Object.fromEntries(
  readdirSync(DIST_DIR, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(sep).join("/"))
    .filter((path) => !EXCLUDED.test(path) && statSync(resolve(DIST_DIR, path)).isFile())
    .sort()
    .map((path) => [path, sha256(readFileSync(resolve(DIST_DIR, path)))])
);

writeFileSync(resolve(DIST_DIR, "build.json"), JSON.stringify({ digest: sha256(JSON.stringify(files)), files }));
