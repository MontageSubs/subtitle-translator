import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { validateManifest } from "../src/lib/models/manifest";
import type { ModelManifest } from "../src/lib/models/types";

const CATALOG_DIRECTORY = "src/model-catalog";
const PUBLIC_DIRECTORY = "public";

const isBundledPath = (url: string): boolean => !url.startsWith("https://");

function bundledFileProblems(manifest: ModelManifest): string[] {
  const sizes: number[] = [];
  const problems = manifest.files.flatMap((file) => {
    const url = file.urls?.find(isBundledPath);
    if (!url) return [];
    const path = join(PUBLIC_DIRECTORY, url);
    if (!existsSync(path)) return [`${file.name}: bundled file ${url} does not exist`];
    const content = readFileSync(path);
    sizes.push(content.length);
    if (file.sha256 === undefined) return [`${file.name}: bundled file needs a sha256`];
    return createHash("sha256").update(content).digest("hex") === file.sha256.toLowerCase() ? [] : [`${file.name}: sha256 does not match ${url}; run lexicon:build`];
  });
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return sizes.length === manifest.files.length && manifest.bytes !== total ? [...problems, `bytes must be ${total}, the size of the bundled files; run lexicon:build`] : problems;
}

const seenIds = new Set<string>();
const problems = readdirSync(CATALOG_DIRECTORY)
  .filter((name) => name.endsWith(".json"))
  .flatMap((file) => {
    const manifest = JSON.parse(readFileSync(join(CATALOG_DIRECTORY, file), "utf8")) as ModelManifest;
    const found = validateManifest(manifest);
    if (manifest.id !== basename(file, ".json")) found.push("id must match the file name");
    if (manifest.id && seenIds.has(manifest.id)) found.push("id is already used by another file");
    if (manifest.id) seenIds.add(manifest.id);
    if (found.length === 0) found.push(...bundledFileProblems(manifest));
    return found.map((problem) => `${file}: ${problem}`);
  });

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
