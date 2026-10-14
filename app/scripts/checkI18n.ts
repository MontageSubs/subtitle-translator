import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(SCRIPTS_DIR, "../src/i18n/locales");
const EN_PATH = resolve(LOCALES_DIR, "en.json");

interface LocaleReport {
  locale: string;
  total: number;
  translated: number;
  percentage: number;
  missing: string[];
  extra: string[];
}

function loadJson(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function runCheck(templateTarget?: string): void {
  const enDict = loadJson(EN_PATH);
  const canonicalKeys = Object.keys(enDict);
  const total = canonicalKeys.length;

  const localeFiles = readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(".json") && !file.includes(".missing."))
    .sort();

  const reports: LocaleReport[] = [];

  for (const file of localeFiles) {
    const locale = file.replace(/\.json$/, "");
    if (locale === "en") continue;
    const dict = loadJson(resolve(LOCALES_DIR, file));
    const targetKeys = new Set(Object.keys(dict));

    const missing = canonicalKeys.filter((k) => !targetKeys.has(k) || dict[k] === "");
    const extra = Object.keys(dict).filter((k) => !(k in enDict));
    const translated = total - missing.length;
    const percentage = Math.round((translated / total) * 100);

    reports.push({ locale, total, translated, percentage, missing, extra });
  }

  console.log(`\ni18n Status Report (${total} canonical keys in en.json):\n`);
  for (const r of reports) {
    const status = r.percentage === 100 ? "✓ 100%" : `${r.percentage}% (${r.missing.length} missing)`;
    console.log(`  [${r.locale.padEnd(8)}] ${status}`);
    if (r.extra.length > 0) {
      console.log(`             ${r.extra.length} unused/extra keys: ${r.extra.slice(0, 5).join(", ")}${r.extra.length > 5 ? "..." : ""}`);
    }
  }
  console.log("");

  if (templateTarget) {
    const target = reports.find((r) => r.locale === templateTarget);
    if (!target) {
      console.error(`Target locale "${templateTarget}" not found in ${LOCALES_DIR}`);
      process.exit(1);
    }
    const missingTemplate = Object.fromEntries(target.missing.map((key) => [key, ""]));
    const outPath = resolve(LOCALES_DIR, `${templateTarget}.missing.json`);
    writeFileSync(outPath, JSON.stringify(missingTemplate, null, 2) + "\n");
    console.log(`Generated missing keys template (${target.missing.length} keys) at:\n  ${outPath}\n`);
  }
}

const args = process.argv.slice(2);
const templateIdx = args.indexOf("--template");
const templateTarget = templateIdx !== -1 ? args[templateIdx + 1] : undefined;

runCheck(templateTarget);
