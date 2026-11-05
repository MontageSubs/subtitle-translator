import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const requiredIndex = args.indexOf("--require");
const required = requiredIndex >= 0 ? args.splice(requiredIndex, 2)[1] : null;

const parseVersion = (text) => text.split(".").map(Number);

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const candidates = args
  .filter((directory) => existsSync(`${directory}/version.json`) && (required === null || existsSync(`${directory}/${required}`)))
  .map((directory) => ({ directory, version: parseVersion(JSON.parse(readFileSync(`${directory}/version.json`, "utf8")).version) }))
  .sort((left, right) => compareVersions(right.version, left.version));

if (candidates.length > 0) process.stdout.write(candidates[0].directory);
