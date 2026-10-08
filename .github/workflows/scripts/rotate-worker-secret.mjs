#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const nowSec = Math.floor(Date.now() / 1000);
const weeks = Math.floor(nowSec / 604800);
const slot = weeks % 2 === 0 ? "WORKER_SECRET_B" : "WORKER_SECRET_A";
const newSecret = randomBytes(32).toString("hex");

process.stdout.write(`::add-mask::${newSecret}\n`);

console.log(`Rotating secret slot: ${slot} (week ${weeks})`);

const ACCOUNT_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}'s Account/g;
const EMAIL_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;

function sanitize(text) {
  if (!text) return "";
  return text
    .replace(ACCOUNT_PATTERN, "[redacted-account]")
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

const message = `rotate: ${slot}`;
const tag = slot === "WORKER_SECRET_A" ? "rot-a" : "rot-b";

const putProc = spawnSync(
  "npx",
  ["--no-install", "wrangler", "versions", "secret", "put", slot, "--message", message, "--tag", tag],
  {
    input: newSecret,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }
);

if (putProc.stdout) {
  process.stdout.write(sanitize(putProc.stdout));
}
if (putProc.stderr) {
  process.stderr.write(sanitize(putProc.stderr));
}

if (putProc.status !== 0) {
  process.exit(putProc.status ?? 1);
}

const versionMatch = putProc.stdout ? putProc.stdout.match(/Created version ([0-9a-fA-F-]+)/i) : null;
const target = versionMatch ? `${versionMatch[1]}@100%` : `${tag}@100%`;

const deployProc = spawnSync(
  "npx",
  ["--no-install", "wrangler", "versions", "deploy", target, "-y", "--message", message],
  {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }
);

if (deployProc.stdout) {
  process.stdout.write(sanitize(deployProc.stdout));
}
if (deployProc.stderr) {
  process.stderr.write(sanitize(deployProc.stderr));
}

if (deployProc.status !== 0) {
  process.exit(deployProc.status ?? 1);
}
