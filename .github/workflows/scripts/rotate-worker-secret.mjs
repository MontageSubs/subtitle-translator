#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const nowSec = Math.floor(Date.now() / 1000);
const weeks = Math.floor(nowSec / 604800);
const slot = weeks % 2 === 0 ? "WORKER_SECRET_B" : "WORKER_SECRET_A";
const newSecret = randomBytes(32).toString("hex");

console.log(`Rotating secret slot: ${slot} (week ${weeks})`);

const ACCOUNT_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}'s Account/g;
const EMAIL_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;

function sanitize(text) {
  if (!text) return "";
  return text
    .replace(ACCOUNT_PATTERN, "[redacted-account]")
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

const proc = spawnSync("npx", ["wrangler", "secret", "put", slot], {
  input: newSecret,
  encoding: "utf-8",
  stdio: ["pipe", "pipe", "pipe"],
});

if (proc.stdout) {
  process.stdout.write(sanitize(proc.stdout));
}
if (proc.stderr) {
  process.stderr.write(sanitize(proc.stderr));
}

if (proc.status !== 0) {
  process.exit(proc.status ?? 1);
}
