import { PRODUCTION_CHANNEL } from "./channelProfile";
import { resolveSiteConfig } from "./site";

export const REPO_URL: string = resolveSiteConfig(import.meta.env, PRODUCTION_CHANNEL).repoUrl;

export const DISCUSSIONS_URL = `${REPO_URL}/discussions`;

export type CommunityEntry = "footer";

const TELEGRAM_INVITE_BY_ENTRY: Readonly<Partial<Record<CommunityEntry, string>>> = {};

export const SOCIAL_LINKS = {
  github: "https://github.com/MontageSubs",
  telegram: "https://t.me/+f6d4VJ0lEvMyNGRh",
  discord: "https://discord.com/invite/UuQ8tFpMYy",
  bluesky: "https://bsky.app/profile/montagesubs.bsky.social",
};

export const telegramInviteFor = (entry: CommunityEntry): string => TELEGRAM_INVITE_BY_ENTRY[entry] ?? SOCIAL_LINKS.telegram;

export const ORGANIZATION = {
  name: "MontageSubs",
  url: "https://montagesubs.github.io/",
  sameAs: [SOCIAL_LINKS.github, SOCIAL_LINKS.bluesky],
} as const;
