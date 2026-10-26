export const CHANNEL_IDS = ["production", "beta"] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export const PRODUCTION_CHANNEL: ChannelId = "production";

const BRAND_HEARTS: Readonly<Record<ChannelId, string>> = { production: "❤️", beta: "💜" };

const PRODUCTION_STORAGE_NAMESPACE = "subtitle-translator";

export interface ChannelProfile {
  id: ChannelId;
  basePath: string;
  storageNamespace: string;
  indexable: boolean;
  heart: string;
  entries: Readonly<Record<ChannelId, string>>;
}

export const isChannelId = (value: unknown): value is ChannelId => (CHANNEL_IDS as readonly unknown[]).includes(value);

const withTrailingSlash = (path: string): string => (path.endsWith("/") ? path : `${path}/`);

const channelSegment = (id: ChannelId): string => (id === PRODUCTION_CHANNEL ? "" : `${id}/`);

export function resolveChannelProfile(id: ChannelId, siteBasePath: string): ChannelProfile {
  const siteBase = withTrailingSlash(siteBasePath);
  const entries = Object.fromEntries(CHANNEL_IDS.map((channel) => [channel, `${siteBase}${channelSegment(channel)}`])) as Record<ChannelId, string>;
  return {
    id,
    basePath: entries[id],
    storageNamespace: id === PRODUCTION_CHANNEL ? PRODUCTION_STORAGE_NAMESPACE : `${PRODUCTION_STORAGE_NAMESPACE}-${id}`,
    indexable: id === PRODUCTION_CHANNEL,
    heart: BRAND_HEARTS[id],
    entries,
  };
}

export const releaseVersion = (id: ChannelId, version: string): string => (id === PRODUCTION_CHANNEL ? version : `${version}-${id}`);

export const storageKeyOf = (profile: ChannelProfile, name: string): string => `${profile.storageNamespace}:${name}`;

export const channelSiteUrl = (productionSiteUrl: string, id: ChannelId): string =>
  id === PRODUCTION_CHANNEL ? productionSiteUrl : `${productionSiteUrl}/${channelSegment(id).slice(0, -1)}`;

export const nestedBasePaths = (profile: ChannelProfile): string[] =>
  Object.values(profile.entries).filter((path) => path !== profile.basePath && path.startsWith(profile.basePath));
