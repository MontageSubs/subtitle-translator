export async function fingerprintOf(url: string): Promise<string | null> {
  const response = await fetch(url, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!response) return null;
  const etag = response.headers.get("x-linked-etag") ?? response.headers.get("etag");
  if (etag) return etag.replace(/^W\//, "").replaceAll('"', "");
  const length = response.headers.get("x-linked-size") ?? response.headers.get("content-length");
  const modified = response.headers.get("last-modified");
  return length && modified ? `${length}@${modified}` : null;
}

export interface UpstreamMeta {
  author?: string;
  homepage?: string;
  license?: string;
  languages?: string[];
}

const HUB_REPOSITORY_PATTERN = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//;
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

export const repositoryOf = (sourceUrl: string): string | null => HUB_REPOSITORY_PATTERN.exec(sourceUrl)?.[1] ?? null;

const asList = (value: unknown): string[] => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).filter((entry): entry is string => typeof entry === "string");

export async function fetchUpstreamMeta(repository: string): Promise<UpstreamMeta | null> {
  const response = await fetch(`https://huggingface.co/api/models/${repository}`).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { author?: unknown; cardData?: { license?: unknown; language?: unknown } } | null;
  if (!body) return null;
  const languages = asList(body.cardData?.language).filter((code) => LANGUAGE_CODE_PATTERN.test(code));
  const license = asList(body.cardData?.license)[0];
  return {
    ...(typeof body.author === "string" && body.author ? { author: body.author } : {}),
    homepage: `https://huggingface.co/${repository}`,
    ...(license ? { license } : {}),
    ...(languages.length ? { languages } : {}),
  };
}
