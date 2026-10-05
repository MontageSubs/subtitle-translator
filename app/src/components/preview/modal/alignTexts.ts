const SAME_TIME_TOLERANCE_MS = 50;
const UNTIMED = -1;

interface Block {
  timeMs: number;
  lines: string[];
}

interface SlotBlock extends Block {
  groupAnchor: number;
  occurrence: number;
}

const SRT_VTT_TIME_PATTERN = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->/;
const ASS_TIME_PATTERN = /^Dialogue: [^,]+,(\d{1,2}):(\d{2}):(\d{2})\.(\d{2}),/;
const STYLE_NAME_PATTERN = /^Style: ([^,]*)/;
const CUE_NUMBER_PATTERN = /^\d+$/;

function lineTimeMs(line: string): number {
  const srt = SRT_VTT_TIME_PATTERN.exec(line);
  if (srt) return Number(srt[1] ?? 0) * 3600000 + Number(srt[2]) * 60000 + Number(srt[3]) * 1000 + Number(srt[4]);
  const ass = ASS_TIME_PATTERN.exec(line);
  return ass ? Number(ass[1]) * 3600000 + Number(ass[2]) * 60000 + Number(ass[3]) * 1000 + Number(ass[4]) * 10 : UNTIMED;
}

function isSameTime(a: number, b: number): boolean {
  return a === UNTIMED || b === UNTIMED ? a === b : Math.abs(a - b) <= SAME_TIME_TOLERANCE_MS;
}

function splitIntoBlocks(text: string): Block[] {
  const blocks: Block[] = [{ timeMs: UNTIMED, lines: [] }];
  for (const line of text.split("\n")) {
    const timeMs = lineTimeMs(line);
    const current = blocks[blocks.length - 1];
    if (timeMs === UNTIMED) {
      current.lines.push(line);
      continue;
    }
    const next: Block = { timeMs, lines: [] };
    const previousLine = current.lines[current.lines.length - 1];
    if (previousLine !== undefined && CUE_NUMBER_PATTERN.test(previousLine.trim())) next.lines.push(current.lines.pop()!);
    next.lines.push(line);
    blocks.push(next);
  }
  return blocks;
}

function tagSlots(blocks: Block[]): SlotBlock[] {
  let groupAnchor = UNTIMED;
  let occurrence = 0;
  return blocks.map((block, index) => {
    if (index === 0 || !isSameTime(groupAnchor, block.timeMs)) {
      groupAnchor = block.timeMs;
      occurrence = 0;
    } else {
      occurrence += 1;
    }
    return { ...block, groupAnchor, occurrence };
  });
}

function isSameSlot(a: SlotBlock, b: SlotBlock): boolean {
  return isSameTime(a.groupAnchor, b.groupAnchor) && a.occurrence === b.occurrence;
}

function lineKey(line: string): string {
  const style = STYLE_NAME_PATTERN.exec(line);
  return style ? `Style:${style[1]}` : line;
}

function padPositional(source: string[], target: string[]): [string[], string[]] {
  const length = Math.max(source.length, target.length);
  const pad = (lines: string[]) => [...lines, ...Array<string>(length - lines.length).fill("")];
  return [pad(source), pad(target)];
}

function padByContent(source: string[], target: string[]): [string[], string[]] {
  const sourceKeys = source.map(lineKey);
  const targetKeys = target.map(lineKey);
  const lcs = Array.from({ length: source.length + 1 }, () => new Array<number>(target.length + 1).fill(0));
  for (let i = source.length - 1; i >= 0; i--) {
    for (let j = target.length - 1; j >= 0; j--) {
      lcs[i][j] = sourceKeys[i] === targetKeys[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const alignedSource: string[] = [];
  const alignedTarget: string[] = [];
  let i = 0;
  let j = 0;
  while (i < source.length || j < target.length) {
    const pairs = i < source.length && j < target.length && sourceKeys[i] === targetKeys[j];
    const takesSource = i < source.length && (j >= target.length || (!pairs && lcs[i + 1][j] >= lcs[i][j + 1]));
    if (pairs) {
      alignedSource.push(source[i++]);
      alignedTarget.push(target[j++]);
    } else if (takesSource) {
      alignedSource.push(source[i++]);
      alignedTarget.push("");
    } else {
      alignedSource.push("");
      alignedTarget.push(target[j++]);
    }
  }
  return [alignedSource, alignedTarget];
}

function padPair(source: SlotBlock, target: SlotBlock): [string[], string[]] {
  return source.timeMs === UNTIMED ? padByContent(source.lines, target.lines) : padPositional(source.lines, target.lines);
}

function distanceToSlot(blocks: SlotBlock[], from: number, slotOf: SlotBlock): number {
  const found = blocks.findIndex((block, index) => index > from && isSameSlot(block, slotOf));
  return found === -1 ? -1 : found - from;
}

export function alignTexts(source: string, target: string): [string, string] {
  const sourceBlocks = tagSlots(splitIntoBlocks(source));
  const targetBlocks = tagSlots(splitIntoBlocks(target));
  const alignedSource: string[] = [];
  const alignedTarget: string[] = [];
  const blank = (count: number) => Array<string>(count).fill("");
  let i = 0;
  let j = 0;

  while (i < sourceBlocks.length || j < targetBlocks.length) {
    const s = sourceBlocks[i];
    const t = targetBlocks[j];
    let takeSourceOnly = !t;
    let paired = false;

    if (s && t) {
      if (isSameSlot(s, t)) {
        paired = true;
      } else {
        const targetAhead = distanceToSlot(targetBlocks, j, s);
        const sourceAhead = distanceToSlot(sourceBlocks, i, t);
        if (targetAhead === -1 && sourceAhead === -1) paired = true;
        else if (targetAhead === -1) takeSourceOnly = true;
        else if (sourceAhead !== -1 && targetAhead <= sourceAhead) takeSourceOnly = true;
      }
    }

    if (paired) {
      const [sourceLines, targetLines] = padPair(s, t);
      alignedSource.push(...sourceLines);
      alignedTarget.push(...targetLines);
      i++;
      j++;
    } else if (takeSourceOnly) {
      alignedSource.push(...s.lines);
      alignedTarget.push(...blank(s.lines.length));
      i++;
    } else {
      alignedTarget.push(...t.lines);
      alignedSource.push(...blank(t.lines.length));
      j++;
    }
  }
  return [alignedSource.join("\n"), alignedTarget.join("\n")];
}
