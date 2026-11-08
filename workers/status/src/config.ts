import { TursoConfig } from "./types";

export interface Env {
  TURSO_URL?: string;
  TURSO_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  PAGES_TOKEN?: string;
  PAGES_PROJECT?: string;
  SITE_STATUS_URL?: string;
  SITE_URL?: string;
  SITE_FEEDBACK_URL?: string;
  SITE_REPO_URL?: string;
  LOG_DEBUG?: string;
  ADMIN_TOKEN?: string;
  DB?: D1Database;
}

export type TursoEnv = Pick<Env, "TURSO_URL" | "TURSO_TOKEN">;

export type SiteEnv = Pick<
  Env,
  "SITE_URL" | "SITE_FEEDBACK_URL" | "SITE_REPO_URL" | "SITE_STATUS_URL" | "PAGES_PROJECT"
>;

export interface SiteConfig {
  mainSiteUrl: string;
  fallbackSiteUrl: string;
  feedbackUrl: string;
  githubRepoUrl: string;
  statusUrl: string;
  statusFallbackUrl: string;
}

export const DEFAULT_MAIN_SITE_URL = "https://subs.js.org/subtitle-translator/";
const DEFAULT_GITHUB_REPO_URL = "https://github.com/MontageSubs/subtitle-translator";

export const stripTrailingSlashes = (url: string): string => url.replace(/\/+$/, "");

function deriveFallbackSiteUrl(githubRepoUrl: string): string {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i.exec(githubRepoUrl);
  return match ? `https://${match[1].toLowerCase()}.github.io/${match[2]}/` : "";
}

function deriveStatusFallbackUrl(statusUrl: string, pagesProject?: string): string {
  const fallback = pagesProject ? `https://${pagesProject}.pages.dev` : "";
  return fallback === statusUrl ? "" : fallback;
}

export function deriveServiceDomain(statusUrl: string): string {
  const labels = (URL.canParse(statusUrl) ? new URL(statusUrl).hostname : "").split(".");
  return labels.length > 2 ? labels.slice(1).join(".") : labels.join(".");
}

export function resolveSiteConfig(env: SiteEnv): SiteConfig {
  const mainSiteUrl = `${stripTrailingSlashes(env.SITE_URL || DEFAULT_MAIN_SITE_URL)}/`;
  const githubRepoUrl = stripTrailingSlashes(env.SITE_REPO_URL || DEFAULT_GITHUB_REPO_URL);
  const statusUrl = stripTrailingSlashes(
    env.SITE_STATUS_URL || (env.PAGES_PROJECT ? `https://${env.PAGES_PROJECT}.pages.dev` : ""),
  );
  return {
    mainSiteUrl,
    fallbackSiteUrl: deriveFallbackSiteUrl(githubRepoUrl),
    feedbackUrl: env.SITE_FEEDBACK_URL || `${mainSiteUrl}docs/feedback/`,
    githubRepoUrl,
    statusUrl,
    statusFallbackUrl: deriveStatusFallbackUrl(statusUrl, env.PAGES_PROJECT),
  };
}

export function resolveMaintenanceDocUrl(githubRepoUrl: string): string {
  return `${githubRepoUrl.replace("https://github.com/", "https://raw.githubusercontent.com/")}/main/workers/status/MAINTENANCE.md`;
}

export function resolveTursoConfig(env: TursoEnv): TursoConfig {
  return { url: env.TURSO_URL || "", authToken: env.TURSO_TOKEN || "" };
}

export const isTursoConfigured = (config: TursoConfig): boolean => Boolean(config.url && config.authToken);
