import { createId } from "../../../utils/id";
import { MatroskaReadError, MatroskaScanOptions, scanMatroska } from "../container/matroska/matroskaScan";
import { buildTrackDocument } from "../container/matroska/trackDocument";
import { trackVariants } from "./documentVariants";
import { resolveTrackLanguage } from "./trackLanguage";
import type { SubtitleVariant, VariantGroup } from "./types";

export type MatroskaRejection = "noTextTrack" | "imageTracksOnly" | "unreadable";

export type MatroskaOutcome = { kind: "group"; group: VariantGroup } | { kind: "rejected"; reason: MatroskaRejection };

const EXTENSION_PATTERN = /\.[^./\\]+$/;

export const baseNameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1).replace(EXTENSION_PATTERN, "");

export async function readMatroskaGroup(file: File, relativePath: string, options: MatroskaScanOptions): Promise<MatroskaOutcome> {
  let scan;
  try {
    scan = await scanMatroska(file, options);
  } catch (error) {
    if (error instanceof MatroskaReadError) return { kind: "rejected", reason: "unreadable" };
    throw error;
  }
  const textTracks = scan.tracks.filter((track) => track.isText);
  if (!textTracks.length) return { kind: "rejected", reason: scan.tracks.length ? "imageTracksOnly" : "noTextTrack" };
  const baseName = baseNameOf(relativePath);
  const variants: SubtitleVariant[] = [];
  for (const track of textTracks) {
    const document = await buildTrackDocument(track, scan.blocksByTrack.get(track.number) ?? []);
    if (!document) continue;
    variants.push(...await trackVariants({ baseName, ...document }, track, resolveTrackLanguage(track)));
  }
  return variants.length ? { kind: "group", group: { id: createId(), relativePath, baseName, variants } } : { kind: "rejected", reason: "noTextTrack" };
}
