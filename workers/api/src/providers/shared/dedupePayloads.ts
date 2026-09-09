export function dedupeByPayload<K>(map: Map<K, string>): { unique: Map<K, string>; alias: Map<K, K> } {
  const unique = new Map<K, string>();
  const alias = new Map<K, K>();
  const seen = new Map<string, K>();
  for (const [key, payload] of map) {
    const rep = seen.get(payload);
    if (rep === undefined) {
      seen.set(payload, key);
      unique.set(key, payload);
    } else {
      alias.set(key, rep);
    }
  }
  return { unique, alias };
}

export function dedupePayloadList(payloads: string[]): { uniquePayloads: string[]; slotOf: number[] } {
  const uniquePayloads: string[] = [];
  const slotOf: number[] = new Array(payloads.length);
  const indexByPayload = new Map<string, number>();
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i]!;
    let slot = indexByPayload.get(payload);
    if (slot === undefined) {
      slot = uniquePayloads.length;
      indexByPayload.set(payload, slot);
      uniquePayloads.push(payload);
    }
    slotOf[i] = slot;
  }
  return { uniquePayloads, slotOf };
}
