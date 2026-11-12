import type { RawSource } from "../archive";
import { withDirectoryOf } from "../archive";
import type { SubtitleVariant, VariantGroup } from "./types";

export function sourceFromVariant(group: VariantGroup, variant: SubtitleVariant): RawSource {
  return {
    name: variant.fileName,
    relativePath: withDirectoryOf(group.relativePath, variant.fileName),
    bytes: variant.bytes,
    choice: { group, variantId: variant.id },
  };
}

export const variantOfChoice = ({ group, variantId }: { group: VariantGroup; variantId: string }): SubtitleVariant | undefined =>
  group.variants.find((variant) => variant.id === variantId);
