#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { production: { type: "string" }, beta: { type: "string" }, out: { type: "string" } } });
if (!values.production || !values.out) {
  console.error("usage: assemble-site.mjs --production <dist> [--beta <dist>] --out <site>");
  process.exit(1);
}

const BETA_DIRECTORY = "beta";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
  console.error(`assemble-site: ${message}`);
  process.exit(1);
};

function inspectBuild(directory, channel, basePath) {
  const manifestPath = resolve(directory, "build.json");
  if (!existsSync(manifestPath)) fail(`${directory} has no build.json`);
  const manifest = readJson(manifestPath);
  if (manifest.channel !== channel) fail(`${directory} was built for "${manifest.channel}", expected "${channel}"`);
  if (manifest.basePath !== basePath) fail(`${directory} base path is "${manifest.basePath}", expected "${basePath}"`);
  const worker = readFileSync(resolve(directory, "sw.js"), "utf8");
  const config = JSON.parse(/^const CONFIG = (.+);$/m.exec(worker)?.[1] ?? "null");
  if (config?.channel !== channel || config.cacheName !== manifest.cacheName) fail(`${directory}/sw.js does not match its build manifest`);
  const entry = readFileSync(resolve(directory, "index.html"), "utf8");
  const foreign = [...entry.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((match) => match[1]).filter((url) => !url.startsWith(basePath));
  if (foreign.length) fail(`${directory}/index.html references outside ${basePath}: ${foreign[0]}`);
  return manifest;
}

const production = inspectBuild(values.production, "production", readJson(resolve(values.production, "build.json")).basePath);
if (existsSync(resolve(values.production, BETA_DIRECTORY))) fail(`production build already contains "${BETA_DIRECTORY}/"`);

const beta = values.beta ? inspectBuild(values.beta, "beta", `${production.basePath}${BETA_DIRECTORY}/`) : undefined;
if (beta && beta.cacheName === production.cacheName) fail("both channels share one cache name");

if (beta) {
  const exposed = ["sitemap.xml"].filter((file) => existsSync(resolve(values.beta, file)));
  if (exposed.length) fail(`beta build must not publish ${exposed.join(", ")}`);
  const productionPages = readFileSync(resolve(values.production, "en", "index.html"), "utf8");
  if (productionPages.includes(`${production.basePath}${BETA_DIRECTORY}/`)) fail("production pages link to the beta channel");
}

rmSync(values.out, { recursive: true, force: true });
mkdirSync(values.out, { recursive: true });
cpSync(values.production, values.out, { recursive: true });
if (beta) cpSync(values.beta, resolve(values.out, BETA_DIRECTORY), { recursive: true });

console.log(`production ${production.version} (${production.buildId})`);
console.log(beta ? `beta ${beta.version} (${beta.buildId})` : "beta not included");
