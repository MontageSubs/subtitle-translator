import type { RawSource } from "../archive";
import { decodeSubtitleBytes } from "../extraction/encoding";
import { detectFormat } from "../formats/extensions";
import { createId } from "../../../utils/id";
import { baseNameOf } from "./baseName";
import { bilingualVariants } from "./documentVariants";
import type { VariantGroup } from "./types";

export async function bilingualGroupOf(source: RawSource): Promise<VariantGroup | null> {
  const { text } = decodeSubtitleBytes(source.bytes);
  const variants = await bilingualVariants({
    baseName: baseNameOf(source.name),
    format: detectFormat(source.name),
    text,
  });
  return variants ? { id: createId(), relativePath: source.relativePath, baseName: baseNameOf(source.name), variants } : null;
}
