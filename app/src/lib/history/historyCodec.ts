export type BodyEncoding = "gzip" | "json";

export interface EncodedBody {
  encoding: BodyEncoding;
  data: ArrayBuffer | string;
}

const GZIP_MAGIC = [0x1f, 0x8b];

const supportsGzip = (): boolean => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function transform(bytes: BlobPart, stream: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
}

export async function encodeBody(value: unknown): Promise<EncodedBody> {
  const json = JSON.stringify(value);
  return supportsGzip() ? { encoding: "gzip", data: await transform(json, new CompressionStream("gzip")) } : { encoding: "json", data: json };
}

export async function decodeBody<T>({ encoding, data }: EncodedBody): Promise<T> {
  const json = encoding === "gzip" ? new TextDecoder().decode(await transform(data as ArrayBuffer, new DecompressionStream("gzip"))) : (data as string);
  return JSON.parse(json) as T;
}

export async function unpackText(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const compressed = GZIP_MAGIC.every((byte, index) => bytes[index] === byte);
  return compressed ? new TextDecoder().decode(await transform(bytes, new DecompressionStream("gzip"))) : new TextDecoder().decode(bytes);
}
