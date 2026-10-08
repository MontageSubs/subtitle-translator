import type { Chapter, Span, Unit } from "../types";
import { assignMarkerIds, cueMarkerTag } from "../markers";
import type { CompiledGlossaryTerm } from "./glossary";
import { matchGlossaryTerms } from "./glossary";
import { isMusicSegment, stripEdgeNotes } from "./music";
import type { Segment } from "./segments";

type Kind = "music" | "dialogue";

interface RawChapter {
  kind: Kind;
  groups: Segment[][];
}

const unitKind = (group: Segment[]): Kind => (group.some((segment) => isMusicSegment(segment.text)) ? "music" : "dialogue");

function joinGroupText(group: Segment[], spans: Span[], isMusicGroup: boolean): string {
  const pieces: string[] = [];
  group.forEach((segment, i) => {
    if (spans[i]!.boundary === "marker") {
      const marker = `${cueMarkerTag(spans[i]!.marker_id)} `;
      pieces.push(i > 0 ? ` ${marker}` : marker);
    } else if (i > 0) {
      pieces.push(" ");
    }
    pieces.push(isMusicGroup ? stripEdgeNotes(segment.text) : segment.text);
  });
  return pieces.join("").trim();
}

function chapterize(groups: Segment[][], sceneChangeMs: number): RawChapter[] {
  const chapters: RawChapter[] = [];
  const open: Partial<Record<Kind, RawChapter>> = {};
  const threadEnd: Partial<Record<Kind, number>> = {};
  for (const group of groups) {
    const kind = unitKind(group);
    let chapter = open[kind];
    if (!chapter || group[0]!.start_ms - threadEnd[kind]! > sceneChangeMs) {
      chapter = { kind, groups: [] };
      chapters.push(chapter);
      open[kind] = chapter;
    }
    chapter.groups.push(group);
    threadEnd[kind] = group[group.length - 1]!.end_ms;
  }
  return chapters;
}

export function buildUnits(groups: Segment[][], glossary: CompiledGlossaryTerm[], sceneChangeMs: number) {
  const units: Unit[] = [];
  const chapters: Chapter[] = [];
  let markerMerges = 0;
  let unitId = 0;

  chapterize(groups, sceneChangeMs).forEach((rawChapter, chapterIndex) => {
    const isMusicChapter = rawChapter.kind === "music";
    const memberGroups = isMusicChapter ? [rawChapter.groups.flat()] : rawChapter.groups;
    const unitIds: number[] = [];
    for (const group of memberGroups) {
      unitId += 1;
      const spans: Span[] = group.map((segment) => ({
        id: segment.cue_id,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        text: segment.text,
        boundary: isMusicChapter || segment.marker_boundary ? "marker" : null,
        dash_index: segment.dash_index || 0,
        style_wrap: segment.style_wrap,
        kind: isMusicSegment(segment.text) ? "music" : "dialogue",
        marker_id: undefined as unknown as string,
      }));
      assignMarkerIds(spans, "marker");
      markerMerges += group.filter((segment) => segment.marker_boundary).length;
      if (group.length === 1 && group[0]!.resolved) {
        units.push({ id: unitId, spans, text: "", term_matches: [], resolved: group[0]!.resolved });
      } else {
        const text = joinGroupText(group, spans, isMusicChapter);
        units.push({ id: unitId, spans, text, term_matches: matchGlossaryTerms(text, glossary), resolved: null });
      }
      unitIds.push(unitId);
    }
    chapters.push({ id: chapterIndex + 1, kind: rawChapter.kind, unit_ids: unitIds });
  });
  return { units, chapters, markerMerges };
}
