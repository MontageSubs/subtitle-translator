import { execSync } from "node:child_process";
import { relative } from "node:path";

export interface DocGitMeta {
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const FALLBACK_META: DocGitMeta = { authorLogin: null, authorAvatarUrl: null, createdAt: "", updatedAt: "" };
const cache = new Map<string, Promise<DocGitMeta>>();

function readGitLog(repoRoot: string, absolutePath: string): { createdAt: string; updatedAt: string; authorName: string } | null {
  try {
    const output = execSync(`git log --follow --format=%aI|%an -- "${absolutePath}"`, { cwd: repoRoot, encoding: "utf-8" }).trim();
    if (!output) return null;
    const lines = output.split("\n");
    const [updatedAt, authorName] = lines[0].split("|");
    const [createdAt] = lines[lines.length - 1].split("|");
    return { createdAt, updatedAt, authorName };
  } catch {
    return null;
  }
}

async function readGithubAuthor(repoSlug: string, relativePath: string): Promise<{ login: string; avatarUrl: string } | null> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(
      `https://api.github.com/repos/${repoSlug}/commits?path=${encodeURIComponent(relativePath)}&per_page=1`,
      { headers }
    );
    if (!response.ok) return null;
    const commits = (await response.json()) as { author: { login: string; avatar_url: string } | null }[];
    const author = commits[0]?.author;
    return author ? { login: author.login, avatarUrl: author.avatar_url } : null;
  } catch {
    return null;
  }
}

async function resolve(repoRoot: string, absolutePath: string): Promise<DocGitMeta> {
  const local = readGitLog(repoRoot, absolutePath);
  const repoSlug = process.env.GITHUB_REPOSITORY;
  const remote = repoSlug ? await readGithubAuthor(repoSlug, relative(repoRoot, absolutePath)) : null;
  if (!local && !remote) return FALLBACK_META;
  return {
    authorLogin: remote?.login ?? local?.authorName ?? null,
    authorAvatarUrl: remote?.avatarUrl ?? null,
    createdAt: local?.createdAt ?? "",
    updatedAt: local?.updatedAt ?? "",
  };
}

export function resolveDocGitMeta(repoRoot: string, absolutePath: string): Promise<DocGitMeta> {
  if (!cache.has(absolutePath)) cache.set(absolutePath, resolve(repoRoot, absolutePath));
  return cache.get(absolutePath)!;
}
