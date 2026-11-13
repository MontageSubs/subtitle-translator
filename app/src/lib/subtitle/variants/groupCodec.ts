import { base64ToBytes, bytesToBase64 } from "../../../utils/bytesBase64";
import { compressBytes, decompressBytes, isCompressionAvailable } from "../../../utils/streamCompression";
import type { SubtitleVariant, VariantGroup } from "./types";

type VariantMeta = Omit<SubtitleVariant, "bytes"> & { byteLength: number };
type GroupMeta = Omit<VariantGroup, "variants"> & { variants: VariantMeta[] };

const RAW_FLAG = 0;
const DEFLATED_FLAG = 1;
const LENGTH_BYTES = 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function layoutOf(group: VariantGroup): Uint8Array {
  const meta: GroupMeta = { ...group, variants: group.variants.map(({ bytes, ...rest }) => ({ ...rest, byteLength: bytes.length })) };
  const header = encoder.encode(JSON.stringify(meta));
  const total = LENGTH_BYTES + header.length + group.variants.reduce((sum, { bytes }) => sum + bytes.length, 0);
  const packed = new Uint8Array(total);
  new DataView(packed.buffer).setUint32(0, header.length);
  packed.set(header, LENGTH_BYTES);
  let offset = LENGTH_BYTES + header.length;
  for (const { bytes } of group.variants) {
    packed.set(bytes, offset);
    offset += bytes.length;
  }
  return packed;
}

export async function packGroup(group: VariantGroup): Promise<string> {
  const layout = layoutOf(group);
  const deflated = isCompressionAvailable();
  const body = deflated ? await compressBytes(layout) : layout;
  const framed = new Uint8Array(body.length + 1);
  framed[0] = deflated ? DEFLATED_FLAG : RAW_FLAG;
  framed.set(body, 1);
  return bytesToBase64(framed);
}

export async function unpackGroup(packed: string): Promise<VariantGroup> {
  const framed = base64ToBytes(packed);
  const body = framed.subarray(1);
  const layout = framed[0] === DEFLATED_FLAG ? await decompressBytes(body) : body;
  const headerLength = new DataView(layout.buffer, layout.byteOffset, layout.byteLength).getUint32(0);
  const meta = JSON.parse(decoder.decode(layout.subarray(LENGTH_BYTES, LENGTH_BYTES + headerLength))) as GroupMeta;
  let offset = LENGTH_BYTES + headerLength;
  const variants = meta.variants.map(({ byteLength, ...rest }): SubtitleVariant => {
    const bytes = layout.slice(offset, offset + byteLength);
    offset += byteLength;
    return { ...rest, bytes };
  });
  return { ...meta, variants };
}
