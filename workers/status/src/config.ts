import { TursoConfig } from "./types";

export interface Env {
  TURSO_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PAGES_API_TOKEN?: string;
  CF_PAGES_PROJECT?: string;
  STATUS_URL?: string;
  MAIN_SITE_URL?: string;
  ISSUE_REPORT_URL?: string;
  GITHUB_REPO_URL?: string;
  MAINTENANCE_DOC_URL?: string;
  DEBUG?: string;
  ADMIN_API_SECRET?: string;
  DB?: D1Database;
}

export type SiteEnv = Pick<
  Env,
  "MAIN_SITE_URL" | "ISSUE_REPORT_URL" | "GITHUB_REPO_URL" | "STATUS_URL" | "CF_PAGES_PROJECT"
>;

export interface SiteConfig {
  mainSiteUrl: string;
  issueReportUrl: string;
  githubRepoUrl: string;
  statusUrl: string;
}

const DEFAULT_MAIN_SITE_URL = "https://subs.js.org/subtitle-translator/";
const DEFAULT_GITHUB_REPO_URL = "https://github.com/MontageSubs/subtitle-translator";

export const stripTrailingSlashes = (url: string): string => url.replace(/\/+$/, "");

export function resolveSiteConfig(env: SiteEnv): SiteConfig {
  const mainSiteUrl = `${stripTrailingSlashes(env.MAIN_SITE_URL || DEFAULT_MAIN_SITE_URL)}/`;
  return {
    mainSiteUrl,
    issueReportUrl: env.ISSUE_REPORT_URL || `${mainSiteUrl}docs/report-issue/`,
    githubRepoUrl: stripTrailingSlashes(env.GITHUB_REPO_URL || DEFAULT_GITHUB_REPO_URL),
    statusUrl: stripTrailingSlashes(
      env.STATUS_URL || (env.CF_PAGES_PROJECT ? `https://${env.CF_PAGES_PROJECT}.pages.dev` : ""),
    ),
  };
}

export function resolveMaintenanceDocUrl(env: Env, githubRepoUrl: string): string {
  const rawRepoBase = githubRepoUrl.replace("https://github.com/", "https://raw.githubusercontent.com/");
  return env.MAINTENANCE_DOC_URL || `${rawRepoBase}/main/workers/status/MAINTENANCE.md`;
}

export function resolveTursoConfig(env: Env): TursoConfig {
  return { url: env.TURSO_URL || "", authToken: env.TURSO_AUTH_TOKEN || "" };
}

export const isTursoConfigured = (config: TursoConfig): boolean => Boolean(config.url && config.authToken);
