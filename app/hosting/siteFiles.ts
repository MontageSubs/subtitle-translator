import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CHANNEL } from "../src/config/channelProfile";
import { resolveSiteConfig } from "../src/config/site";
import { NOT_FOUND_LABEL, notFoundTitle } from "../src/config/notFound";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { escapeHtml } from "../src/utils/escapeHtml";
import { readLocaleText } from "../vite-plugins/i18n/locales";
import { sha256Of } from "./localFile";

const HOSTING_DIR = dirname(fileURLToPath(import.meta.url));

export interface SiteFiles {
  headers: string;
  notFound: string;
  digest: string;
}

export function readSiteFiles(headersFile: string): SiteFiles {
  const { siteUrl } = resolveSiteConfig({ VITE_SITE_URL: process.env.MAIN_SITE_URL }, PRODUCTION_CHANNEL);
  const headers = readFileSync(headersFile, "utf8");
  const title = escapeHtml(notFoundTitle(readLocaleText(DEFAULT_LOCALE, "app.brand") ?? ""));
  const notFound = readFileSync(resolve(HOSTING_DIR, "site", "404.html"), "utf8")
    .replaceAll("__SITE_URL__", siteUrl)
    .replaceAll("__NOT_FOUND_TITLE__", title)
    .replaceAll("__NOT_FOUND_LABEL__", NOT_FOUND_LABEL);
  return { headers, notFound, digest: sha256Of(Buffer.from(`${headers}\0${notFound}`)).slice(0, 16) };
}
