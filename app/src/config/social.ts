import { resolveSiteConfig } from "./site";

export const REPO_URL: string = resolveSiteConfig(import.meta.env).repoUrl;

export const SOCIAL_LINKS = {
  github: "https://github.com/MontageSubs",
  telegram: "https://t.me/s/MTSubs",
  discord: "https://discord.com/invite/UuQ8tFpMYy",
  bluesky: "https://bsky.app/profile/montagesubs.bsky.social",
};
