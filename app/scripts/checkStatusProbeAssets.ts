import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FRONTEND_PROBE_PATHS } from "../../workers/status/src/monitoring/frontendProbePaths";
import { resolveBuildChannel } from "../vite-plugins/channel";

const CHANNEL = resolveBuildChannel(process.env);
const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", CHANNEL.outDir);

if (!FRONTEND_PROBE_PATHS.some((path) => existsSync(resolve(DIST_DIR, path)))) {
  console.error(`The status worker probes the web app through one of these files, and none exists in ${CHANNEL.outDir}: ${FRONTEND_PROBE_PATHS.join(", ")}.\nShipping this build would report the web app as unreachable. Keep one of them, or update workers/status/src/monitoring/frontendProbePaths.ts in the same change.`);
  process.exit(1);
}
