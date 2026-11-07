import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const localesDir = join(process.cwd(), "app/src/i18n/locales");
const fixed = [];

for (const file of readdirSync(localesDir).filter((name) => name.endsWith(".json")).sort()) {
  const path = join(localesDir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  const keys = Object.keys(data);
  const sortedKeys = [...keys].sort();
  if (keys.every((key, index) => key === sortedKeys[index])) continue;
  const sorted = Object.fromEntries(sortedKeys.map((key) => [key, data[key]]));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
  fixed.push(file);
}

if (fixed.length) console.log(`sorted i18n keys: ${fixed.join(", ")}`);
