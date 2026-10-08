const DEFAULT_SITE_URL = "https://subs.js.org/subtitle-translator";
const DEFAULT_REPO_URL = "https://github.com/MontageSubs/subtitle-translator";
const DEFAULT_REPO_BRANCH = "main";

export interface SiteConfig {
  siteUrl: string;
  repoUrl: string;
  repoBranch: string;
}

type Env = Record<string, string | undefined>;

function normalizedUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

export function resolveSiteConfig(env: Env): SiteConfig {
  return {
    siteUrl: normalizedUrl(env.VITE_SITE_URL, DEFAULT_SITE_URL),
    repoUrl: normalizedUrl(env.VITE_REPO_URL, DEFAULT_REPO_URL),
    repoBranch: env.VITE_REPO_BRANCH?.trim() || DEFAULT_REPO_BRANCH,
  };
}

export function repoFileUrl({ repoUrl, repoBranch }: SiteConfig, repoRelativePath: string): string {
  return `${repoUrl}/blob/${repoBranch}/${repoRelativePath}`;
}

export function pathWithinSite(siteUrl: string, href: string): string | undefined {
  try {
    const site = new URL(siteUrl);
    const target = new URL(href, site);
    const sitePath = site.pathname.replace(/\/+$/, "");
    const withinSite = target.origin === site.origin && (target.pathname === sitePath || target.pathname.startsWith(`${sitePath}/`));
    return withinSite ? `${target.pathname.slice(sitePath.length) || "/"}${target.search}${target.hash}` : undefined;
  } catch {
    return undefined;
  }
}
