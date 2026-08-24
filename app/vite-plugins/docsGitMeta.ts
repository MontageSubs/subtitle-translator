import { execSync } from "node:child_process";
import { relative } from "node:path";

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

function readGitLog(repoRoot: string, absolutePath: string): { createdAt: string; updatedAt: string } | null {
  try {
    const output = execSync(`git log --follow --format=%aI -- "${absolutePath}"`, { cwd: repoRoot, encoding: "utf-8" }).trim();
    if (!output) return null;
    const dates = output.split("\n");
    return { createdAt: dates[dates.length - 1], updatedAt: dates[0] };
  } catch {
    return null;
  }
}

async function readGithubAuthors(repoSlug: string, relativePath: string): Promise<DocAuthor[]> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(
      `https://api.github.com/repos/${repoSlug}/commits?path=${encodeURIComponent(relativePath)}&per_page=100`,
      { headers }
    );
    if (!response.ok) return [];
    const commits = (await response.json()) as { author: { login: string; avatar_url: string } | null }[];
    const seen = new Map<string, DocAuthor>();
    for (const commit of commits) {
      const author = commit.author;
      if (author && !seen.has(author.login)) seen.set(author.login, { login: author.login, avatarUrl: author.avatar_url });
    }
    return [...seen.values()];
  } catch {
    return [];
  }
}

async function resolve(repoRoot: string, absolutePath: string): Promise<DocGitMeta> {
  const local = readGitLog(repoRoot, absolutePath);
  const repoSlug = process.env.GITHUB_REPOSITORY;
  const authors = repoSlug ? await readGithubAuthors(repoSlug, relative(repoRoot, absolutePath)) : [];
  if (!local && !authors.length) return FALLBACK_META;
  return { authors, createdAt: local?.createdAt ?? "", updatedAt: local?.updatedAt ?? "" };
}

export function resolveDocGitMeta(repoRoot: string, absolutePath: string): Promise<DocGitMeta> {
  if (!cache.has(absolutePath)) cache.set(absolutePath, resolve(repoRoot, absolutePath));
  return cache.get(absolutePath)!;
}
