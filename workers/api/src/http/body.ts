export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(await new Blob(chunks).text()) as T;
  } catch {
    return null;
  }
}
