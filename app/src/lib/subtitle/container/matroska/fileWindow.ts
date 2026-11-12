const EMPTY = new Uint8Array(0);

export class FileWindow {
  private bytes = EMPTY;
  private origin = 0;

  constructor(private readonly source: Blob, private readonly windowSize: number) {}

  get size(): number {
    return this.source.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || offset >= this.source.size || length <= 0) return EMPTY;
    const end = Math.min(this.source.size, offset + length);
    if (offset < this.origin || end > this.origin + this.bytes.length) await this.load(offset, end - offset);
    return this.bytes.subarray(offset - this.origin, end - this.origin);
  }

  private async load(offset: number, length: number): Promise<void> {
    const readLength = Math.min(this.source.size - offset, Math.max(this.windowSize, length));
    this.bytes = new Uint8Array(await this.source.slice(offset, offset + readLength).arrayBuffer());
    this.origin = offset;
  }
}
