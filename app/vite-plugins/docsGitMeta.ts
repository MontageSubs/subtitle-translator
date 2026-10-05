import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { relative, resolve as resolvePath } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

export interface DocAuthor {
  login: string;
  avatarUrl: string;
}

export interface DocGitMeta {
  authors: DocAuthor[];
  createdAt: string;
  updatedAt: string;
}

const FALLBACK_META: DocGitMeta = { authors: [], createdAt: "", updatedAt: "" };
const cache = new Map<string, Promise<DocGitMeta>>();
const avatarCache = new Map<string, Promise<string | null>>();
const docImageCache = new Map<string, Promise<string | null>>();
const emittedAssets = new Map<string, string>();

export function getEmittedAssets(): { relPath: string; absPath: string }[] {
  return [...emittedAssets.entries()].map(([relPath, absPath]) => ({ relPath, absPath }));
}

function emitAsset(relPath: string, absPath: string): string {
  emittedAssets.set(relPath, absPath);
  return relPath;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function downloadAvatar(login: string, remoteUrl: string, publicDir: string): Promise<string | null> {
  if (!avatarCache.has(login)) {
    avatarCache.set(
      login,
      (async () => {
        const authorsDir = resolvePath(publicDir, "authors");
        const existing = ["png", "jpg", "gif", "webp"].find((ext) => existsSync(resolvePath(authorsDir, `${login}.${ext}`)));
        if (existing) return emitAsset(`authors/${login}.${existing}`, resolvePath(authorsDir, `${login}.${existing}`));
        try {
          const response = await fetch(`${remoteUrl}${remoteUrl.includes("?") ? "&" : "?"}s=64`);
          if (!response.ok) return null;
          const extension = EXTENSION_BY_CONTENT_TYPE[response.headers.get("content-type") || ""] || "png";
          const filename = `${login}.${extension}`;
          const absPath = resolvePath(authorsDir, filename);
          mkdirSync(authorsDir, { recursive: true });
          writeFileSync(absPath, Buffer.from(await response.arrayBuffer()));
          return emitAsset(`authors/${filename}`, absPath);
        } catch {
          return null;
        }
      })()
    );
  }
  return avatarCache.get(login)!;
}

export function downloadDocImage(remoteUrl: string, publicDir: string): Promise<string | null> {
  if (!docImageCache.has(remoteUrl)) {
    docImageCache.set(
      remoteUrl,
      (async () => {
        try {
          const response = await fetch(remoteUrl);
          if (!response.ok) return null;
          const extension = EXTENSION_BY_CONTENT_TYPE[response.headers.get("content-type") || ""];
          if (!extension) return null;
          const bytes = Buffer.from(await response.arrayBuffer());
          const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
          const assetsDir = resolvePath(publicDir, "docs-assets");
          const filename = `${hash}.${extension}`;
          const absPath = resolvePath(assetsDir, filename);
          if (!existsSync(absPath)) {
            mkdirSync(assetsDir, { recursive: true });
            writeFileSync(absPath, bytes);
          }
          return emitAsset(`docs-assets/${filename}`, absPath);
        } catch {
          return null;
        }
      })()
    );
  }
  return docImageCache.get(remoteUrl)!;
}

function readGitLog(repoRoot: string, absolutePath: string): { createdAt: string; updatedAt: string } | null {
  try {
    const output = execFileSync("git", ["log", "--follow", "--format=%aI", "--", absolutePath], { cwd: repoRoot, encoding: "utf-8" }).trim();
    if (!output) return null;
    const dates = output.split("\n");
    return { createdAt: dates[dates.length - 1], updatedAt: dates[0] };
  } catch {
    return null;
  }
}

async function readGithubAuthors(repoSlug: string, relativePath: string, publicDir: string): Promise<DocAuthor[]> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(
      `https://api.github.com/repos/${repoSlug}/commits?path=${encodeURIComponent(relativePath)}&per_page=100`,
      { headers }
    );
    if (!response.ok) return [];
    const commits = (await response.json()) as { author: { login: string; avatar_url: string } | null }[];
    const seen = new Map<string, { login: string; avatar_url: string }>();
    for (const commit of commits) {
      const author = commit.author;
      if (author && !seen.has(author.login)) seen.set(author.login, author);
    }
    return Promise.all(
      [...seen.values()].map(async (author) => ({
        login: author.login,
        avatarUrl: (await downloadAvatar(author.login, author.avatar_url, publicDir)) || author.avatar_url,
      }))
    );
  } catch {
    return [];
  }
}

async function resolve(repoRoot: string, absolutePath: string, publicDir: string): Promise<DocGitMeta> {
  const local = readGitLog(repoRoot, absolutePath);
  const repoSlug = process.env.GITHUB_REPOSITORY;
  const authors = repoSlug ? await readGithubAuthors(repoSlug, relative(repoRoot, absolutePath), publicDir) : [];
  if (!local && !authors.length) return FALLBACK_META;
  return { authors, createdAt: local?.createdAt ?? "", updatedAt: local?.updatedAt ?? "" };
}

export function resolveDocGitMeta(repoRoot: string, absolutePath: string, publicDir: string): Promise<DocGitMeta> {
  if (!cache.has(absolutePath)) cache.set(absolutePath, resolve(repoRoot, absolutePath, publicDir));
  return cache.get(absolutePath)!;
}
