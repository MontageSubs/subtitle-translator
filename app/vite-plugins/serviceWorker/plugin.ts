import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { nestedBasePaths } from "../../src/config/channelProfile";
import type { BuildChannel } from "../channel";

const WORKER_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), "worker.js");
const CONFIG_MARKER = "__SERVICE_WORKER_CONFIG__";

export function serviceWorkerPlugin(channel: BuildChannel): Plugin {
  const config = { channel: channel.id, cacheName: channel.cacheName, nestedBasePaths: nestedBasePaths(channel) };
  return {
    name: "service-worker",
    apply: "build",
    generateBundle() {
      const source = readFileSync(WORKER_SOURCE, "utf8");
      if (!source.includes(CONFIG_MARKER)) throw new Error("service worker source lost its config marker");
      this.emitFile({ type: "asset", fileName: "sw.js", source: source.replace(CONFIG_MARKER, () => JSON.stringify(config)) });
    },
  };
}
