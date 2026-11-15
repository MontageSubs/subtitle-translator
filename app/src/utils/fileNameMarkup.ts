import { escapeHtml } from "./escapeHtml";

const TAIL_CODE_POINTS = 14;
const MIN_SPLIT_CODE_POINTS = TAIL_CODE_POINTS + 4;

export function fileNameInner(name: string): string {
  const points = Array.from(name);
  if (points.length < MIN_SPLIT_CODE_POINTS) return `<bdi class="fname__head">${escapeHtml(name)}</bdi>`;
  const head = points.slice(0, points.length - TAIL_CODE_POINTS).join("");
  const tail = points.slice(points.length - TAIL_CODE_POINTS).join("");
  return `<bdi class="fname__head">${escapeHtml(head)}</bdi><bdi class="fname__tail">${escapeHtml(tail)}</bdi>`;
}
