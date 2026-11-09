import { enableDragScroll } from "../../../utils/dragScroll";
import { alignTexts } from "./alignTexts";
import type { PreviewSession } from "./session";

export interface CompareViewHandle {
  update(source: string, target: string): void;
}

const CHUNK_LINES = 200;
const WIDEST_LINE_CANDIDATES = 16;
const SAFETY_MARGIN_GLYPHS = 2;
const WIDTH_PROPERTY = "--compare-width";
const CHUNK_LINES_PROPERTY = "--chunk-lines";
const WIDE_GLYPH_PATTERN = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]|[\ud840-\ud87f][\udc00-\udfff]/;

function rankWidestLines(lines: string[]): string[] {
  const ranked: { line: string; score: number }[] = [];
  for (const line of lines) {
    const score = WIDE_GLYPH_PATTERN.test(line) ? line.length * 2 : line.length;
    const floor = ranked.length === WIDEST_LINE_CANDIDATES ? ranked[ranked.length - 1].score : -1;
    if (score <= floor) continue;
    ranked.push({ line, score });
    ranked.sort((a, b) => b.score - a.score);
    if (ranked.length > WIDEST_LINE_CANDIDATES) ranked.pop();
  }
  return ranked.map((entry) => entry.line);
}

function measureContentWidth(columns: HTMLElement, lineSets: string[][]): number {
  const style = getComputedStyle(columns);
  const glyphSize = parseFloat(style.fontSize);
  const candidates = lineSets.flatMap(rankWidestLines);
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return (Math.max(0, ...candidates.map((line) => line.length)) + SAFETY_MARGIN_GLYPHS) * glyphSize;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const widest = Math.max(0, ...candidates.map((line) => context.measureText(line).width));
  return widest + SAFETY_MARGIN_GLYPHS * context.measureText("0").width;
}

function fillChunks(column: HTMLElement, lines: string[]): void {
  const fragment = document.createDocumentFragment();
  for (let start = 0; start < lines.length; start += CHUNK_LINES) {
    const part = lines.slice(start, start + CHUNK_LINES);
    const chunk = document.createElement("div");
    chunk.className = "preview-compare-chunk";
    if (part.length !== CHUNK_LINES) chunk.style.setProperty(CHUNK_LINES_PROPERTY, String(part.length));
    chunk.textContent = part.join("\n");
    fragment.append(chunk);
  }
  column.replaceChildren(fragment);
}

function mirrorHorizontalScroll(panes: readonly HTMLElement[]): void {
  const mirrored = new Map<HTMLElement, number>();
  for (const leader of panes) {
    leader.addEventListener("scroll", () => {
      const position = leader.scrollLeft;
      const echoed = mirrored.get(leader) === position;
      mirrored.delete(leader);
      if (echoed) return;
      for (const follower of panes) {
        if (follower === leader || follower.scrollLeft === position) continue;
        const before = follower.scrollLeft;
        follower.scrollLeft = position;
        if (follower.scrollLeft !== before) mirrored.set(follower, follower.scrollLeft);
      }
    }, { passive: true });
  }
}

export function mountCompareView(session: PreviewSession): CompareViewHandle {
  const container = session.query<HTMLElement>(".preview-compare-container");
  const sourceColumn = session.query<HTMLElement>("#preview-compare-source");
  const targetColumn = session.query<HTMLElement>("#preview-compare-target");
  const scroller = session.query<HTMLElement>(".preview-compare-scroller");

  mirrorHorizontalScroll([sourceColumn, targetColumn, scroller]);
  enableDragScroll(sourceColumn);
  enableDragScroll(targetColumn);

  return {
    update(source, target) {
      const [alignedSource, alignedTarget] = alignTexts(source, target);
      const sourceLines = alignedSource.split("\n");
      const targetLines = alignedTarget.split("\n");
      container.style.setProperty(WIDTH_PROPERTY, `${Math.ceil(measureContentWidth(sourceColumn, [sourceLines, targetLines]))}px`);
      fillChunks(sourceColumn, sourceLines);
      fillChunks(targetColumn, targetLines);
    },
  };
}
