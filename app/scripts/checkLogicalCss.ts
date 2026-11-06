import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PHYSICAL_DECLARATIONS = [
  /(?:^|[;{\s])(?:margin|padding|scroll-margin|scroll-padding)-(?:left|right)\s*:/,
  /(?:^|[;{\s])border-(?:left|right)(?:-[a-z]+)?\s*:/,
  /(?:^|[;{\s])border-(?:top|bottom)-(?:left|right)-radius\s*:/,
  /(?:^|[;{\s])(?:left|right)\s*:/,
  /(?:^|[;{\s])(?:text-align|float|clear)\s*:\s*(?:left|right)\b/,
];

function cssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? cssFiles(path) : path.endsWith(".css") ? [path] : [];
  });
}

const violations = cssFiles("src").flatMap((file) =>
  readFileSync(file, "utf8").split("\n").flatMap((line, index) => (PHYSICAL_DECLARATIONS.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
);

if (violations.length) {
  console.error(`Physical direction properties found; use logical properties so right-to-left locales mirror correctly:\n${violations.join("\n")}`);
  process.exit(1);
}
