import { createId } from "../../../utils/id";
import { MatroskaScanOptions, scanMatroska } from "../container/matroska/matroskaScan";
import { buildTrackDocument } from "../container/matroska/trackDocument";
import { baseNameOf } from "./baseName";
import { trackVariants } from "./documentVariants";
import { resolveTrackLanguage } from "./trackLanguage";
import { flagsFromTrackName } from "./trackNameTraits";
import { inferHearingImpaired } from "./hearingImpairedInference";
import type { SubtitleVariant, VariantGroup } from "./types";

export type MatroskaRejection = "noSupportedSubtitle";

export type MatroskaOutcome = { kind: "group"; group: VariantGroup } | { kind: "rejected"; reason: MatroskaRejection };

export async function readMatroskaGroup(file: File, relativePath: string, options: MatroskaScanOptions): Promise<MatroskaOutcome> {
  const scan = await scanMatroska(file, options);
  const textTracks = scan.tracks.filter((track) => track.isText);
  if (!textTracks.length) return { kind: "rejected", reason: "noSupportedSubtitle" };
  const baseName = baseNameOf(relativePath);
  const variants: SubtitleVariant[] = [];
  for (const track of textTracks) {
    const document = await buildTrackDocument(track, scan.blocksByTrack.get(track.number) ?? []);
    if (!document) continue;
    const nameFlags = flagsFromTrackName(track.name);
    const metadata = { ...track, isForced: track.isForced || nameFlags.isForced, isHearingImpaired: track.isHearingImpaired || nameFlags.isHearingImpaired };
    variants.push(...await trackVariants({ baseName, ...document }, metadata, resolveTrackLanguage(track)));
  }
  return variants.length ? { kind: "group", group: { id: createId(), relativePath, baseName, variants: inferHearingImpaired(variants) } } : { kind: "rejected", reason: "noSupportedSubtitle" };
}
