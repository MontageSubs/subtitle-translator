import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";

const DIRECTORY = fileURLToPath(new URL("../src/metadata/", import.meta.url));
const PLACEHOLDER = /\{[a-zA-Z]+\}/g;

const read = (file: string): Record<string, string> => JSON.parse(readFileSync(resolve(DIRECTORY, file), "utf-8"));
const placeholdersOf = (text: string): string => [...(text.match(PLACEHOLDER) ?? [])].sort().join(",");

const reference = read(`${DEFAULT_LOCALE}.json`);
const errors: string[] = [];
const gaps: string[] = [];

for (const [key, text] of Object.entries(reference)) if (!text.trim()) errors.push(`${DEFAULT_LOCALE}: "${key}" is empty`);

for (const file of readdirSync(DIRECTORY).filter((name) => name.endsWith(".json") && name !== `${DEFAULT_LOCALE}.json`)) {
  const catalog = read(file);
  const locale = file.replace(/\.json$/, "");
  for (const [key, text] of Object.entries(catalog)) {
    if (!(key in reference)) errors.push(`${locale}: "${key}" is not defined in ${DEFAULT_LOCALE}`);
    else if (!text.trim()) errors.push(`${locale}: "${key}" is empty`);
    else if (placeholdersOf(text) !== placeholdersOf(reference[key])) errors.push(`${locale}: "${key}" placeholders differ from ${DEFAULT_LOCALE}`);
  }
  const missing = Object.keys(reference).filter((key) => !(key in catalog));
  if (missing.length) gaps.push(`${locale}: ${missing.length} of ${Object.keys(reference).length} entries absent, tags for them are omitted`);
}

gaps.forEach((gap) => console.warn(`metadata: ${gap}`));
if (errors.length) {
  errors.forEach((error) => console.error(`error: ${error}`));
  process.exit(1);
}
console.log("metadata check passed");
