import { primaryLanguage, type LocaleCode } from "../i18n/locales.config";
import { PRODUCTION_CHANNEL } from "./channelProfile";
import { resolveSiteConfig } from "./site";

const SITE = resolveSiteConfig(import.meta.env, PRODUCTION_CHANNEL);

export const REPO_URL: string = SITE.repoUrl;
export const MAIN_SITE_URL = `${new URL(SITE.siteUrl).origin}/`;

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

export const ORGANIZATION = { name: "MontageSubs" } as const;

interface OrganizationProfile {
  url: string;
  languages?: readonly string[];
}

const CHINESE_ONLY = ["zh"] as const;

const ORGANIZATION_PROFILES: readonly OrganizationProfile[] = [
  { url: SOCIAL_LINKS.github },
  { url: SOCIAL_LINKS.bluesky },
  { url: "https://mastodon.social/@montagesubs" },
  { url: "https://x.com/Montage_Subs" },
  { url: "https://t.me/s/MTSubs" },
  { url: "https://www.youtube.com/@MontageSubs" },
  { url: "https://www.instagram.com/MontageSubs/" },
  { url: "https://montagesubs.medium.com/" },
  { url: "https://substack.com/@montagesubs" },
  { url: "https://weibo.com/u/8358891788", languages: CHINESE_ONLY },
  { url: "https://space.bilibili.com/3493120803080246", languages: CHINESE_ONLY },
];

export const organizationProfilesFor = (locale: LocaleCode): string[] =>
  ORGANIZATION_PROFILES.filter(({ languages }) => !languages || languages.includes(primaryLanguage(locale))).map(({ url }) => url);
