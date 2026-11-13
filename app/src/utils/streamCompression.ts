type Transform = CompressionStream | DecompressionStream;

const FORMAT = "deflate-raw";

export const isCompressionAvailable = (): boolean => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

async function through(bytes: Uint8Array, transform: Transform): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close());
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
}

export const compressBytes = (bytes: Uint8Array): Promise<Uint8Array> => through(bytes, new CompressionStream(FORMAT));

export const decompressBytes = (bytes: Uint8Array): Promise<Uint8Array> => through(bytes, new DecompressionStream(FORMAT));
