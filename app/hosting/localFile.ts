import { createHash } from "node:crypto";
import { closeSync, createWriteStream, mkdtempSync, openSync, readSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { partPathOf, planPartSizes } from "../src/config/assetLayout";
import { extensionOf, pagesHash } from "./pagesDirectUpload";

export interface DescribedPart {
  bytes: number;
  sha256: string;
  pages: string;
}

export interface DescribedFile {
  bytes: number;
  sha256: string;
  parts: DescribedPart[];
}

export const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export function readRange(path: string, offset: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  const descriptor = openSync(path, "r");
  try {
    let filled = 0;
    while (filled < length) {
      const read = readSync(descriptor, buffer, filled, length - filled, offset + filled);
      if (read === 0) throw new Error(`${path} ended before byte ${offset + length}`);
      filled += read;
    }
    return buffer;
  } finally {
    closeSync(descriptor);
  }
}

export function describeLocalFile(path: string, name: string): DescribedFile {
  const sizes = planPartSizes(statSync(path).size);
  const whole = createHash("sha256");
  let offset = 0;
  const parts = sizes.map((size, index) => {
    const bytes = readRange(path, offset, size);
    offset += size;
    whole.update(bytes);
    return { bytes: size, sha256: sha256Of(bytes), pages: pagesHash(bytes, extensionOf(partPathOf(name, index, sizes.length))) };
  });
  return { bytes: offset, sha256: whole.digest("hex"), parts };
}

export function sha256OfFile(path: string): string {
  const hash = createHash("sha256");
  const size = statSync(path).size;
  const chunk = 8 * 1024 * 1024;
  for (let offset = 0; offset < size; offset += chunk) hash.update(readRange(path, offset, Math.min(chunk, size - offset)));
  return hash.digest("hex");
}

export class Workspace {
  readonly directory = mkdtempSync(join(tmpdir(), "assets-"));
  private counter = 0;

  nextPath(): string {
    this.counter += 1;
    return join(this.directory, `file-${this.counter}`);
  }

  dispose(): void {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export async function downloadTo(url: string, destination: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destination));
      return;
    } catch (error) {
      if (attempt >= 3) throw new Error(`downloading ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
}

export class SourceFiles {
  private readonly loaders = new Map<string, () => Promise<string>>();
  private readonly resolved = new Map<string, Promise<string>>();

  register(id: string, load: () => Promise<string>): void {
    this.loaders.set(id, load);
    this.resolved.delete(id);
  }

  has(id: string): boolean {
    return this.loaders.has(id);
  }

  path(id: string, expectedSha256: string): Promise<string> {
    const known = this.resolved.get(id);
    if (known) return known;
    const load = this.loaders.get(id);
    if (!load) return Promise.reject(new Error(`no way to obtain ${id}`));
    const pending = load().then((path) => {
      if (sha256OfFile(path) !== expectedSha256) throw new Error(`${id} no longer matches the recorded checksum`);
      return path;
    });
    this.resolved.set(id, pending);
    return pending;
  }

  async range(id: string, expectedSha256: string, offset: number, length: number): Promise<Buffer> {
    return readRange(await this.path(id, expectedSha256), offset, length);
  }
}
