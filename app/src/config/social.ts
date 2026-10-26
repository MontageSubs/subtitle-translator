import { PRODUCTION_CHANNEL } from "./channelProfile";
import { resolveSiteConfig } from "./site";

export const REPO_URL: string = resolveSiteConfig(import.meta.env, PRODUCTION_CHANNEL).repoUrl;

export const SOCIAL_LINKS = {
  github: "https://github.com/MontageSubs",
  telegram: "https://t.me/+f6d4VJ0lEvMyNGRh",
  discord: "https://discord.com/invite/UuQ8tFpMYy",
  bluesky: "https://bsky.app/profile/montagesubs.bsky.social",
};
