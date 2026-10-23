export interface Mark {
  at: number;
  raw: string;
  name: string | null;
  closing: boolean;
}

export interface MarkedText {
  visible: string;
  marks: Mark[];
}

const MARKUP_PATTERN = /\{[^}]*\}|<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;

export function separateMarkup(text: string): MarkedText {
  if (!text.includes("<") && !text.includes("{")) return { visible: text, marks: [] };
  const marks: Mark[] = [];
  let visible = "";
  let last = 0;
  for (const match of text.matchAll(MARKUP_PATTERN)) {
    visible += text.slice(last, match.index);
    marks.push({ at: visible.length, raw: match[0], name: match[2]?.toLowerCase() ?? null, closing: match[1] === "/" });
    last = match.index! + match[0].length;
  }
  return { visible: visible + text.slice(last), marks };
}

export function pairedSpans(marked: MarkedText): Array<[number, number]> {
  const open: Mark[] = [];
  const spans: Array<[number, number]> = [];
  for (const mark of marked.marks) {
    if (!mark.name) continue;
    if (!mark.closing) {
      open.push(mark);
      continue;
    }
    const index = open.map((entry) => entry.name).lastIndexOf(mark.name);
    if (index < 0) continue;
    spans.push([open[index]!.at, mark.at]);
    open.length = index;
  }
  return spans;
}

function render(visible: string, marks: Mark[], offset: number): string {
  let out = "";
  let cursor = 0;
  for (const mark of marks) {
    const at = Math.max(0, mark.at - offset);
    out += visible.slice(cursor, at) + mark.raw;
    cursor = at;
  }
  return out + visible.slice(cursor);
}

export function cutMarked({ visible, marks }: MarkedText, lineEnd: number, nextStart: number): [string, string] {
  const first: Mark[] = [];
  const second: Mark[] = [];
  const open: Mark[] = [];
  for (const mark of marks) {
    const toFirst = mark.at < lineEnd || (mark.at === lineEnd && mark.closing);
    (toFirst ? first : second).push(mark);
    if (!toFirst || !mark.name) continue;
    if (!mark.closing) open.push(mark);
    else open.length = Math.max(0, open.map((entry) => entry.name).lastIndexOf(mark.name));
  }
  const closers = [...open].reverse().map((mark) => ({ ...mark, at: lineEnd, raw: `</${mark.name}>`, closing: true }));
  const reopeners = open.map((mark) => ({ ...mark, at: nextStart }));
  return [
    render(visible.slice(0, lineEnd), [...first, ...closers], 0),
    render(visible.slice(nextStart), [...reopeners, ...second], nextStart),
  ];
}
