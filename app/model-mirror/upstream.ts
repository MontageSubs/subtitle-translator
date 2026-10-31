export async function fingerprintOf(url: string): Promise<string | null> {
  const response = await fetch(url, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!response) return null;
  const etag = response.headers.get("x-linked-etag") ?? response.headers.get("etag");
  if (etag) return etag.replace(/^W\//, "").replaceAll('"', "");
  const length = response.headers.get("x-linked-size") ?? response.headers.get("content-length");
  const modified = response.headers.get("last-modified");
  return length && modified ? `${length}@${modified}` : null;
}
