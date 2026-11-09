import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const requiredIndex = args.indexOf("--require");
const required = requiredIndex >= 0 ? args.splice(requiredIndex, 2)[1] : null;

const VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.+-]+)?$/;

function parseVersion(text) {
  const match = VERSION_PATTERN.exec(text);
  if (!match) throw new Error(`"${text}" is not a valid version`);
  return { numbers: [1, 2, 3, 4].map((index) => Number(match[index] ?? 0)), prerelease: match[5] ?? "" };
}

function compareVersions(left, right) {
  const numeric = left.numbers.reduce((difference, part, index) => difference || part - right.numbers[index], 0);
  if (numeric !== 0 || left.prerelease === right.prerelease) return numeric;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease, "en", { numeric: true });
}

const candidates = args
  .filter((directory) => existsSync(`${directory}/version.json`) && (required === null || existsSync(`${directory}/${required}`)))
  .map((directory) => ({ directory, version: parseVersion(JSON.parse(readFileSync(`${directory}/version.json`, "utf8")).version) }))
  .sort((left, right) => compareVersions(right.version, left.version));

if (candidates.length > 0) process.stdout.write(candidates[0].directory);
