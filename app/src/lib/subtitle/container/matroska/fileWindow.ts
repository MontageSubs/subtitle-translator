import type { PauseGate } from "./pauseGate";

const EMPTY = new Uint8Array(0);
const MIN_READ_BYTES = 16 * 1024;
const MAX_READ_BYTES = 8 * 1024 * 1024;
const SEQUENTIAL_GAP_BYTES = 8 * 1024;

export class FileWindow {
  private bytes = EMPTY;
  private origin = 0;
  private readSize = MIN_READ_BYTES;

  constructor(private readonly source: Blob, private readonly gate?: PauseGate) {}

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
    await this.gate?.wait();
    const gap = offset - (this.origin + this.bytes.length);
    this.readSize = gap >= 0 && gap <= SEQUENTIAL_GAP_BYTES ? Math.min(MAX_READ_BYTES, this.readSize * 2) : MIN_READ_BYTES;
    const readLength = Math.min(this.source.size - offset, Math.max(this.readSize, length));
    this.bytes = new Uint8Array(await this.source.slice(offset, offset + readLength).arrayBuffer());
    this.origin = offset;
  }
}
