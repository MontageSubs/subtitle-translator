export class BoundedMap<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly capacity: number) {}

  get(key: K): V | undefined {
    return this.entries.get(key);
  }

  set(key: K, value: V): this {
    if (!this.entries.has(key) && this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, value);
    return this;
  }
}
