import type { Plugin } from "vite";
import { PRODUCTION_CHANNEL, type ChannelProfile } from "../src/config/channelProfile";
import { repoFileUrl, type SiteConfig } from "../src/config/site";

const SECURITY_TXT_FILE = ".well-known/security.txt";
const EXPIRES = "2100-01-01T01:01:00Z";
const PREFERRED_LANGUAGES = "en";
const CONTRIBUTE_SOURCE = "docs/contribute/en.md";
const COMMUNITY_SOURCE = "docs/community/en.md";
const SECURITY_SOURCE = "docs/security/en.md";

export function renderSecurityTxt(site: SiteConfig, workerUrl: string): string {
  const siteLink = (path: string): string => `${site.siteUrl}/${path}`;
  const mirrors = workerUrl ? [`${workerUrl}/${SECURITY_TXT_FILE}`] : [];
  return `${[
    `Acknowledgments: ${siteLink("contribute/")}`,
    `Acknowledgments: ${repoFileUrl(site, CONTRIBUTE_SOURCE)}`,
    `Canonical: ${siteLink(SECURITY_TXT_FILE)}`,
    ...mirrors.map((url) => `Canonical: ${url}`),
    `Contact: ${siteLink("docs/community/")}`,
    `Contact: ${repoFileUrl(site, COMMUNITY_SOURCE)}`,
    `Expires: ${EXPIRES}`,
    `Hiring: ${siteLink("contribute/")}`,
    `Hiring: ${repoFileUrl(site, CONTRIBUTE_SOURCE)}`,
    `Policy: ${siteLink("docs/security/")}`,
    `Policy: ${repoFileUrl(site, SECURITY_SOURCE)}`,
    `Preferred-Languages: ${PREFERRED_LANGUAGES}`,
  ].join("\n")}\n`;
}

export function securityTxtPlugin(site: SiteConfig, workerUrl: string, channel: ChannelProfile): Plugin {
  return {
    name: "security-txt",
    apply: "build",
    generateBundle() {
      if (channel.id !== PRODUCTION_CHANNEL) return;
      this.emitFile({ type: "asset", fileName: SECURITY_TXT_FILE, source: renderSecurityTxt(site, workerUrl) });
    },
  };
}
