#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH_SIZE = 10000;
const KEY_CHECK_ATTEMPTS = 6;
const KEY_CHECK_DELAY_MS = 5000;
const ACCEPTED_STATUSES = new Set([200, 202]);

const { values } = parseArgs({ options: { sitemap: { type: "string" }, "site-url": { type: "string" } } });
const key = process.env.VITE_INDEXNOW_KEY?.trim();
if (!values.sitemap || !values["site-url"] || !key) {
  console.error("usage: VITE_INDEXNOW_KEY=<key> submit-indexnow.mjs --sitemap <file> --site-url <url>");
  process.exit(1);
}

const siteUrl = values["site-url"].replace(/\/+$/, "");
const keyLocation = `${siteUrl}/${key}.txt`;
const unescapeXml = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const urlList = [...readFileSync(values.sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => unescapeXml(match[1].trim())).filter((url) => url === siteUrl || url.startsWith(`${siteUrl}/`));

if (!urlList.length) {
  console.error("indexnow: the sitemap lists no URLs under the site");
  process.exit(1);
}

async function keyIsPublished() {
  for (let attempt = 0; attempt < KEY_CHECK_ATTEMPTS; attempt++) {
    const response = await fetch(keyLocation, { cache: "no-store" }).catch(() => null);
    if (response?.ok && (await response.text()).trim() === key) return true;
    await delay(KEY_CHECK_DELAY_MS);
  }
  return false;
}

if (!(await keyIsPublished())) {
  console.error("indexnow: the key file is not reachable at the published key location");
  process.exit(1);
}

const host = new URL(siteUrl).host;
for (let start = 0; start < urlList.length; start += BATCH_SIZE) {
  const batch = urlList.slice(start, start + BATCH_SIZE);
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host, key, keyLocation, urlList: batch }) });
  if (!ACCEPTED_STATUSES.has(response.status)) {
    const reason = (await response.text().catch(() => "")).replaceAll(key, "***").slice(0, 300);
    console.error(`indexnow: submission rejected with HTTP ${response.status} ${reason}`.trim());
    process.exit(1);
  }
  console.log(`indexnow: submitted ${batch.length} URLs (HTTP ${response.status})`);
}
