import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const GUARDED_DIRECTORIES = ["src/lib/models", "src/lib/net"];
const ALLOWED_FILE = join("src", "lib", "net", "siteFetch.ts");
const RAW_FETCH = /(?<![\w.])fetch\s*\(/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const violations = GUARDED_DIRECTORIES.flatMap(sourceFiles)
  .filter((file) => file !== ALLOWED_FILE)
  .flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) => (RAW_FETCH.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])));

if (violations.length) {
  console.error(`Model and runtime requests must go through siteFetch so every cross-origin request carries an Origin header:\n${violations.join("\n")}`);
  process.exit(1);
}
