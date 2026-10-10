import type { Unit } from "../../subtitle/types";
import { expectedCueIds, singleCueId, splitCueChunks } from "./cueChunks";
import { isLeakedUntranslated } from "../../subtitle/common/untranslated";

export function findLeakedCueIds(unit: Unit, text: string, sourceLang: string, targetLang: string): string[] {
  const markerIds = expectedCueIds(unit);
  if (markerIds.length) {
    const chunks = splitCueChunks(text);
    const spanText = new Map(unit.spans.filter((span) => span.boundary === "marker").map((span) => [span.marker_id, span.text]));
    return markerIds.filter((id) => chunks.has(id) && isLeakedUntranslated(spanText.get(id) ?? "", chunks.get(id)!, sourceLang, targetLang));
  }
  const id = singleCueId(unit);
  return id !== null && isLeakedUntranslated(unit.text, text, sourceLang, targetLang) ? [id] : [];
}
