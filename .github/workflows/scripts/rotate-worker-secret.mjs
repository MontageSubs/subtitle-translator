#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const nowSec = Math.floor(Date.now() / 1000);
const weeks = Math.floor(nowSec / 604800);
const slot = weeks % 2 === 0 ? "SIGNING_SECRET_B" : "SIGNING_SECRET_A";
const newSecret = randomBytes(32).toString("hex");

process.stdout.write(`::add-mask::${newSecret}\n`);

const ACCOUNT_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}'s Account/g;
const EMAIL_PATTERN = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/g;

function sanitize(text) {
  if (!text) return "";
  return text
    .replace(ACCOUNT_PATTERN, "[redacted-account]")
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

const message = `rotate: ${slot}`;
const tag = slot === "SIGNING_SECRET_A" ? "rot-a" : "rot-b";

function runWrangler(args, input) {
  const proc = spawnSync("npx", ["--no-install", "wrangler", ...args], { input, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  if (proc.stdout) process.stdout.write(sanitize(proc.stdout));
  if (proc.stderr) process.stderr.write(sanitize(proc.stderr));
  if (proc.status !== 0) process.exit(proc.status ?? 1);
  return proc.stdout ?? "";
}

function uploadSecret(workerName) {
  const output = runWrangler(["versions", "secret", "put", slot, "--name", workerName, "--message", message, "--tag", tag], newSecret);
  const version = output.match(/Created version ([0-9a-fA-F-]+)/i);
  return { workerName, target: version ? `${version[1]}@100%` : `${tag}@100%` };
}

const workerNames = (process.env.WORKER_NAMES ?? "").split(" ").filter(Boolean);
if (!workerNames.length) {
  process.stderr.write("::error::no Worker to rotate\n");
  process.exit(1);
}

const uploads = workerNames.map(uploadSecret);
for (const { workerName, target } of uploads) runWrangler(["versions", "deploy", target, "--name", workerName, "-y", "--message", message]);
