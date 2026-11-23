import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const TYPESCRIPT_CLI = resolve(APP_DIR, "node_modules/typescript/bin/tsc");
const VITE_CLI = resolve(APP_DIR, "node_modules/vite/bin/vite.js");
const CHECKS = ["checkI18n", "checkMetadata", "checkLogicalCss", "checkModelCatalog", "checkRequestOrigin"];
const POST_BUILD_STEPS = ["prerender", "emitBuildManifest", "checkStatusProbeAssets"];

const running = new Set<ChildProcess>();

const run = (label: string, args: string[]): Promise<void> =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: APP_DIR, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    running.add(child);
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", fail);
    child.on("close", (code) => {
      running.delete(child);
      if (code === 0) done();
      else fail(new Error(`${label} failed with exit code ${code}\n${output}`));
    });
  });

const runScript = (name: string): Promise<void> => run(name, ["--import", "tsx", resolve(APP_DIR, "scripts", `${name}.ts`)]);

async function buildAndFinalize(): Promise<void> {
  await run("vite build", [VITE_CLI, "build"]);
  for (const step of POST_BUILD_STEPS) await runScript(step);
}

try {
  await Promise.all([run("typecheck", [TYPESCRIPT_CLI, "-p", ".", "--noEmit"]), ...CHECKS.map(runScript), buildAndFinalize()]);
} catch (error) {
  for (const child of running) child.kill();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
