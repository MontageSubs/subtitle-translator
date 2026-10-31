import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CHANNEL } from "../src/config/channelProfile";
import { resolveSiteConfig } from "../src/config/site";
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
  const notFound = readFileSync(resolve(HOSTING_DIR, "site", "404.html"), "utf8").replaceAll("__SITE_URL__", siteUrl);
  return { headers, notFound, digest: sha256Of(Buffer.from(`${headers}\0${notFound}`)).slice(0, 16) };
}
