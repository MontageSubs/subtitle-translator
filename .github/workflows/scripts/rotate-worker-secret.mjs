#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const nowSec = Math.floor(Date.now() / 1000);
const weeks = Math.floor(nowSec / 604800);
const slot = weeks % 2 === 0 ? "WORKER_SECRET_B" : "WORKER_SECRET_A";
const newSecret = randomBytes(32).toString("hex");

console.log(`Rotating secret slot: ${slot} (week ${weeks})`);

const proc = spawnSync("npx", ["wrangler", "secret", "put", slot], {
  input: newSecret,
  encoding: "utf-8",
  stdio: ["pipe", "inherit", "inherit"],
});

if (proc.status !== 0) {
  process.exit(proc.status ?? 1);
}
