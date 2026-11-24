import type { Plugin } from "vite";
import { PRODUCTION_CHANNEL, type ChannelProfile } from "../src/config/channelProfile";

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export function indexNowPlugin(env: Record<string, string | undefined>, channel: ChannelProfile): Plugin {
  const key = env.VITE_INDEXNOW_KEY?.trim() ?? "";
  return {
    name: "index-now",
    apply: "build",
    generateBundle() {
      if (channel.id !== PRODUCTION_CHANNEL || !key) return;
      if (!KEY_PATTERN.test(key)) {
        this.warn("VITE_INDEXNOW_KEY must be 8-128 characters of letters, digits or dashes; the IndexNow key file was not emitted");
        return;
      }
      this.emitFile({ type: "asset", fileName: `.well-known/${key}.txt`, source: key });
    },
  };
}
