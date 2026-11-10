import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CHANNEL } from "../src/config/channelProfile";
import { resolveSiteConfig } from "../src/config/site";
import { notFoundTitle } from "../src/config/notFound";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { renderNotFoundDocument } from "../src/render/notFoundDocument";
import { readLocaleText } from "../vite-plugins/i18n/locales";
import { sha256Of } from "./localFile";

const FAVICON_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons", "favicon.svg");

export interface SiteFiles {
  headers: string;
  notFound: string;
  digest: string;
}

export function readSiteFiles(headersFile: string): SiteFiles {
  const { siteUrl } = resolveSiteConfig({ VITE_SITE_URL: process.env.MAIN_SITE_URL }, PRODUCTION_CHANNEL);
  const headers = readFileSync(headersFile, "utf8");
  const notFound = renderNotFoundDocument({
    title: notFoundTitle(readLocaleText(DEFAULT_LOCALE, "app.brand") ?? ""),
    homeUrl: siteUrl,
    iconUrl: `data:image/svg+xml,${encodeURIComponent(readFileSync(FAVICON_FILE, "utf8"))}`,
  });
  return { headers, notFound, digest: sha256Of(Buffer.from(`${headers}\0${notFound}`)).slice(0, 16) };
}
