import type { SubtitleFormat } from "../types";

export type VariantOrigin = "track" | "side";

export interface SubtitleVariant {
  id: string;
  origin: VariantOrigin;
  language: string | null;
  trackName: string | null;
  format: SubtitleFormat;
  fileName: string;
  bytes: Uint8Array;
  cueCount: number;
  preview: string;
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
}

export interface VariantGroup {
  id: string;
  relativePath: string;
  baseName: string;
  variants: SubtitleVariant[];
}

export interface SourceChoice {
  group: VariantGroup;
  variantId: string;
}
