import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { validateManifest } from "../src/lib/models/manifest";

const CATALOG_DIRECTORY = "src/model-catalog";

const seenIds = new Set<string>();
const problems = readdirSync(CATALOG_DIRECTORY)
  .filter((name) => name.endsWith(".json"))
  .flatMap((file) => {
    const manifest = JSON.parse(readFileSync(join(CATALOG_DIRECTORY, file), "utf8")) as { id?: string };
    const found = validateManifest(manifest);
    if (manifest.id !== basename(file, ".json")) found.push("id must match the file name");
    if (manifest.id && seenIds.has(manifest.id)) found.push("id is already used by another file");
    if (manifest.id) seenIds.add(manifest.id);
    return found.map((problem) => `${file}: ${problem}`);
  });

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
