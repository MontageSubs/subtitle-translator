export function dedupeByPayload<K>(payloads: Map<K, string>): { unique: Map<K, string>; aliasOf: Map<K, K> } {
  const unique = new Map<K, string>();
  const aliasOf = new Map<K, K>();
  const representative = new Map<string, K>();
  for (const [key, payload] of payloads) {
    const existing = representative.get(payload);
    if (existing === undefined) {
      representative.set(payload, key);
      unique.set(key, payload);
    } else {
      aliasOf.set(key, existing);
    }
  }
  return { unique, aliasOf };
}

export function propagateAliases<K, V>(results: Map<K, V>, aliasOf: Map<K, K>): void {
  for (const [duplicate, representative] of aliasOf) {
    const value = results.get(representative);
    if (value !== undefined) results.set(duplicate, value);
  }
}
