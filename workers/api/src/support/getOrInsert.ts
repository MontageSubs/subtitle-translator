interface Slot<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
}

export function getOrInsert<K, V>(map: Slot<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) map.set(key, (value = create()));
  return value;
}
