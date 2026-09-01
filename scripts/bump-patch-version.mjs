#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const [, , filePath, pattern, beforeRef] = process.argv;
if (!filePath || !pattern) {
  console.error("usage: bump-patch-version.mjs <file> <regex-with-one-capture-group> [before-git-ref]");
  process.exit(1);
}

function wasVersionLineTouchedSince(ref) {
  if (!ref) return false;
  try {
    execSync(`git cat-file -e ${ref}`, { stdio: "ignore" });
  } catch {
    return false;
  }
  const diff = execSync(`git diff ${ref} -- ${filePath}`, { encoding: "utf-8" });
  const versionLine = new RegExp(pattern);
  return diff.split("\n").some((line) => /^[+-]/.test(line) && versionLine.test(line));
}

const content = readFileSync(filePath, "utf-8");
const match = content.match(new RegExp(pattern));
if (!match) {
  console.error(`version pattern not found in ${filePath}`);
  process.exit(1);
}

if (wasVersionLineTouchedSince(beforeRef)) {
  console.error(`version in ${filePath} was already changed by hand in this push; skipping automatic bump`);
  console.log(match[1]);
  process.exit(0);
}

const current = match[1];
const semver = current.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);
if (!semver) {
  console.error(`"${current}" is not a valid semver string (expected e.g. 1.2.3 or 1.2.3-beta)`);
  process.exit(1);
}

const [, major, minor, patch, prerelease = ""] = semver;
const nextVersion = `${major}.${minor}.${Number(patch) + 1}${prerelease}`;
writeFileSync(filePath, content.replace(current, nextVersion));
console.log(nextVersion);
