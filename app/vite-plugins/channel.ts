import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CHANNEL, isChannelId, releaseVersion, resolveChannelProfile, type ChannelProfile } from "../src/config/channelProfile";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export interface BuildChannel extends ChannelProfile {
  version: string;
  buildId: string;
  outDir: string;
  cacheName: string;
}

function readAppVersion(): string {
  const { version } = JSON.parse(readFileSync(resolve(APP_DIR, "version.json"), "utf8")) as { version?: string };
  if (!version || !VERSION_PATTERN.test(version)) throw new Error(`app/version.json must hold a major.minor.patch version, found "${version}"`);
  return version;
}

export const browserProfile = ({ id, basePath, storageNamespace, indexable, heart, entries }: BuildChannel): ChannelProfile => ({ id, basePath, storageNamespace, indexable, heart, entries });

export function resolveBuildChannel(env: Record<string, string | undefined>): BuildChannel {
  const requested = env.APP_CHANNEL?.trim() || PRODUCTION_CHANNEL;
  if (!isChannelId(requested)) throw new Error(`APP_CHANNEL must be "production" or "beta", received "${requested}"`);
  const profile = resolveChannelProfile(requested, env.VITE_BASE_PATH || "/");
  return {
    ...profile,
    version: releaseVersion(requested, readAppVersion()),
    buildId: env.APP_BUILD_ID?.trim() || "local",
    outDir: requested === PRODUCTION_CHANNEL ? "dist" : `dist-${requested}`,
    cacheName: `${profile.storageNamespace}:shell`,
  };
}
