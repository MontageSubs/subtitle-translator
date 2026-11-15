import type { RawBlock } from "./clusterScan";
import type { BlockCompression } from "./tracks";

const textDecoder = new TextDecoder("utf-8");

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(data: Uint8Array, compression: BlockCompression | null): Promise<Uint8Array> {
  if (!compression) return data;
  if (compression.algorithm === "zlib") return inflate(data);
  const restored = new Uint8Array(compression.prefix.length + data.length);
  restored.set(compression.prefix);
  restored.set(data, compression.prefix.length);
  return restored;
}

export interface DecodedBlock {
  startMs: number;
  durationMs: number | null;
  text: string;
}

export async function decodeBlocks(blocks: readonly RawBlock[], compression: BlockCompression | null): Promise<DecodedBlock[]> {
  const decoded: DecodedBlock[] = [];
  for (const block of blocks) {
    try {
      decoded.push({ startMs: block.startMs, durationMs: block.durationMs, text: textDecoder.decode(await decompress(block.data, compression)) });
    } catch {
      continue;
    }
  }
  return decoded;
}
