import { baseLanguage } from "../common/languageCodes";
import { MUSIC_NOTE_CHARS } from "../common/charClass";
import { MarkedText, separateMarkup } from "./linebreak/inlineMarkup";

type Spacing = "" | " ";

interface Gap {
  start: number;
  end: number;
  left: string;
  right: string;
}

interface Mark {
  text: string;
  start: number;
  end: number;
  before: Gap;
  after: Gap;
}

type QuoteRole = "open" | "close" | undefined;

type SpacingPlan = Map<number, { end: number; spacing: Spacing }>;

interface Edit {
  start: number;
  end: number;
  insert: string;
}

const LITERAL_SOURCE = [
  "(?:[a-z][a-z0-9+.-]*:\\/\\/|www\\.)[^\\s<>{}\"«»]*[^\\s<>{}\"«».,;:!?)\\]’”]",
  "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+",
  "(?<![\\w.-])[\\w-]+(?:\\.[\\w-]+)+\\/[^\\s<>{}\"«»]*[^\\s<>{}\"«».,;:!?)\\]’”]",
  "&(?:[a-z][a-z0-9]*|#\\d+|#x[\\da-f]+);",
  "(?<!\\S)[:;]-?[()DPp](?!\\S)",
  "<\\d[\\d:.]*>",
].join("|");
const LITERAL_PATTERN = new RegExp(LITERAL_SOURCE, "gi");
const LITERAL_FILLER = "a";

const GROUPED_NUMBER_PATTERN = /(?<![\p{L}\p{N}.,#])\d{1,3}(?:(?:,\d{3}){2,}(?:\.\d+)?|(?:\.\d{3}){2,}(?:,\d+)?)(?!\p{N}|[.,]\d)/gu;
const NO_BREAK_DIGIT_GROUP_PATTERN = /(?<=\d)[   ](?=\d{3}(?!\d))/g;
const PREFIXED_AMOUNT_PATTERN =
  /(?<![\p{L}\p{N}\p{Sc}])(?<!\p{N}[   ])(\p{Sc})[   ]?(\d+(?:[ ,]\d{3})*(?:[.,]\d{1,2})?)(?![\p{L}\p{N}]|[.,]\d|[   ]?(?:\p{Sc}|(?:millions?|milliards?|billions?|trillions?|mille|Md|M|k)(?!\p{L})))/gu;

const COMPATIBILITY_PUNCTUATION = /[！？；：‼⁇⁈⁉﹔﹕﹖﹗]/g;
const MANAGED_MARK_PATTERN = /[?!‽]+|:+|\.{2,}|…|[;,.«»‹›“”‘"()[\]—–%‰]|\p{Sc}/gu;
const HORIZONTAL_SPACE = /[^\S\n]/;
const DIGIT = /\p{N}/u;
const LETTER = /\p{L}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const WORD_START = new RegExp(`[\\p{L}\\p{N}«‹“(${MUSIC_NOTE_CHARS}]`, "u");
const WORD_END = /[\p{L}\p{N})\]»›”’]/u;
const BEFORE_OPENING_GUILLEMET = /[\p{L}\p{N},.;:!?…%)\]}»›”]/u;
const BEFORE_PARENTHETICAL_DASH = /[\p{L}\p{N},»”’)"]/u;
const AFTER_PARENTHETICAL_DASH = /[\p{L}\p{N}«“("]/u;
const OPENING_CONTEXT = "([{«‹“-—–";
const CLOSING_CONTEXT = ".,;:!?…)]}»›”";
const DASHES = "-—–";
const STACKABLE_TERMINALS = "?!‽…";
const OPENS_WITH_SPEAKER_DASH = /^\s*[-—–]/;
const DETACHED_AFTER_STOP = `${CLOSING_CONTEXT}«‹`;

export const isFrenchLanguage = (code: string): boolean => baseLanguage(code) === "fr";

export const usesFranceSpacingByDefault = (code: string): boolean => !/[-_]ca\b/i.test(code);

export const FRENCH_UNBREAKABLE_PATTERNS: readonly RegExp[] = [
  /\d{1,3}(?: \d{3})+(?!\d)/g,
  /\d [\p{Sc}%‰]/gu,
  /\S [—–]/g,
  /["“([]«|»["”)\]]/g,
];

const maskLiterals = (visible: string): string => visible.replace(LITERAL_PATTERN, (literal) => LITERAL_FILLER.repeat(literal.length));

function localizeGroupedNumber(matched: string): string {
  const separator = /[.,]/.exec(matched)![0];
  const groups = matched.split(".");
  if (separator === "." && groups.length === 4 && !matched.includes(",") && groups.every((group) => !group.startsWith("0") && Number(group) <= 255)) return matched;
  const decimalMark = separator === "," ? "." : ",";
  const [integer, fraction] = matched.split(decimalMark);
  const grouped = integer!.split(separator).join(" ");
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

const replaceMatch = (match: RegExpExecArray, insert: string): Edit => ({ start: match.index, end: match.index + match[0].length, insert });

function moveCurrencyAfterAmount(match: RegExpExecArray): Edit[] {
  const [matched, symbol, amount] = match;
  const end = match.index + matched!.length;
  const amountStart = end - amount!.length;
  const localized = amount!.replace(/,(?=\d{3}(?!\d))/g, " ").replace(/\.(?=\d{1,2}$)/, ",");
  return [
    { start: match.index, end: amountStart, insert: "" },
    { start: amountStart, end, insert: localized },
    { start: end, end, insert: ` ${symbol}` },
  ];
}

function relocate(at: number, edits: readonly Edit[]): number {
  let shift = 0;
  for (const { start, end, insert } of edits) {
    const delta = insert.length - (end - start);
    if (delta === 0) continue;
    if (end <= at) shift += delta;
    else if (start < at) return start + shift;
  }
  return at + shift;
}

function editVisible(marked: MarkedText, edits: readonly Edit[]): MarkedText {
  if (!edits.length) return marked;
  let visible = "";
  let copied = 0;
  for (const { start, end, insert } of edits) {
    visible += marked.visible.slice(copied, start) + insert;
    copied = end;
  }
  return { visible: visible + marked.visible.slice(copied), marks: marked.marks.map((mark) => ({ ...mark, at: relocate(mark.at, edits) })) };
}

const rewriteVisible = (marked: MarkedText, pattern: RegExp, editsOf: (match: RegExpExecArray) => Edit[]): MarkedText =>
  editVisible(marked, Array.from(maskLiterals(marked.visible).matchAll(pattern)).flatMap(editsOf));

function localizeNumbers(marked: MarkedText): MarkedText {
  if (!DIGIT.test(marked.visible)) return marked;
  const spaced = rewriteVisible(marked, NO_BREAK_DIGIT_GROUP_PATTERN, (match) => [replaceMatch(match, " ")]);
  const grouped = rewriteVisible(spaced, GROUPED_NUMBER_PATTERN, (match) => [replaceMatch(match, localizeGroupedNumber(match[0]))]);
  return rewriteVisible(grouped, PREFIXED_AMOUNT_PATTERN, moveCurrencyAfterAmount);
}

function gapBetween(visible: string, start: number, end: number): Gap {
  return { start, end, left: visible[start - 1] ?? "\n", right: visible[end] ?? "\n" };
}

function markAt(visible: string, text: string, start: number): Mark {
  const end = start + text.length;
  let from = start;
  let to = end;
  while (from > 0 && HORIZONTAL_SPACE.test(visible[from - 1]!)) from--;
  while (to < visible.length && HORIZONTAL_SPACE.test(visible[to]!)) to++;
  return { text, start, end, before: gapBetween(visible, from, start), after: gapBetween(visible, end, to) };
}

const isTight = (gap: Gap): boolean => gap.start === gap.end;

function planGap(plan: SpacingPlan, gap: Gap, spacing: Spacing): void {
  if (gap.left === "\n" || gap.right === "\n") return;
  if (plan.get(gap.start)?.spacing !== "") plan.set(gap.start, { end: gap.end, spacing });
}

const isBlankOrEdge = (char: string | undefined): boolean => char === undefined || /\s/.test(char);

function followsSpeakerDash(visible: string, gap: Gap): boolean {
  if (!DASHES.includes(gap.left)) return false;
  const beforeDash = visible[gap.start - 2];
  return isBlankOrEdge(beforeDash) || OPENING_CONTEXT.includes(beforeDash!);
}

function followsTerminalStack(visible: string, gap: Gap): boolean {
  if (STACKABLE_TERMINALS.includes(gap.left)) return true;
  return gap.left === "." && markAt(visible, gap.left, gap.start - 1).before.left === ".";
}

function straightQuoteRoles(visible: string): Map<number, QuoteRole> {
  const quotes: { at: number; opens: boolean; closes: boolean }[] = [];
  for (let at = visible.indexOf('"'); at >= 0; at = visible.indexOf('"', at + 1)) {
    const previous = visible[at - 1];
    const next = visible[at + 1];
    const startsPhrase = isBlankOrEdge(previous) || OPENING_CONTEXT.includes(previous!);
    const endsPhrase = isBlankOrEdge(next) || CLOSING_CONTEXT.includes(next!);
    quotes.push({ at, opens: startsPhrase && !endsPhrase, closes: !startsPhrase && endsPhrase });
  }
  const alternates = quotes.length % 2 === 0 && quotes.every((quote, index) => !(index % 2 ? quote.opens : quote.closes));
  return new Map(
    quotes.map((quote, index): [number, QuoteRole] => {
      if (alternates) return [quote.at, index % 2 ? "close" : "open"];
      return [quote.at, quote.opens ? "open" : quote.closes ? "close" : undefined];
    }),
  );
}

function spaceHighPunctuation(plan: SpacingPlan, visible: string, { before, after }: Mark, spacing: Spacing): void {
  const keepsLeft =
    followsSpeakerDash(visible, before) || MUSIC_NOTE_CHARS.includes(before.left) || (spacing === "" && "«‹:".includes(before.left));
  if (followsTerminalStack(visible, before)) planGap(plan, before, "");
  else if (!keepsLeft) planGap(plan, before, spacing);
  if (WORD_START.test(after.right)) planGap(plan, after, " ");
}

function spaceColon(plan: SpacingPlan, visible: string, mark: Mark): void {
  const { before, after, text } = mark;
  if (text.length > 1) return;
  if (isTight(before) && isTight(after) && DIGIT.test(before.left) && DIGIT.test(after.right)) return;
  if (isTight(after) && (after.right === "/" || after.right === "\\")) return;
  if (!followsTerminalStack(visible, before)) spaceHighPunctuation(plan, visible, mark, " ");
  else if (WORD_START.test(after.right)) planGap(plan, after, " ");
}

function spaceComma(plan: SpacingPlan, visible: string, { before, after }: Mark): void {
  const touchesDigit = isTight(after) && DIGIT.test(after.right);
  if (touchesDigit && isTight(before) && DIGIT.test(before.left)) return;
  if (!touchesDigit && !followsSpeakerDash(visible, before)) planGap(plan, before, "");
  if (before.left !== "\n" && (LETTER.test(after.right) || "«“".includes(after.right))) planGap(plan, after, " ");
}

const closesWord = (after: Gap): boolean => !isTight(after) || after.right === "\n" || DETACHED_AFTER_STOP.includes(after.right);

const attachesBackward = (before: Gap): boolean => WORD_END.test(before.left) || STACKABLE_TERMINALS.includes(before.left);

function spacePeriod(plan: SpacingPlan, { before, after }: Mark): void {
  if (closesWord(after) && (before.left === "." || attachesBackward(before))) planGap(plan, before, "");
}

function spaceEllipsis(plan: SpacingPlan, { before, after }: Mark): void {
  const resumesWord = isTight(after) && LETTER_OR_DIGIT.test(after.right);
  if (!resumesWord && (before.left === "." || attachesBackward(before))) planGap(plan, before, "");
  if (resumesWord && isTight(before) && WORD_END.test(before.left) && LETTER.test(after.right)) planGap(plan, after, " ");
}

function spaceDash(plan: SpacingPlan, { text, before, after }: Mark): void {
  if (!BEFORE_PARENTHETICAL_DASH.test(before.left) || !AFTER_PARENTHETICAL_DASH.test(after.right)) return;
  const joinsWords = text === "—" && LETTER.test(before.left) && LETTER.test(after.right);
  if (isTight(before) && isTight(after) && !joinsWords) return;
  planGap(plan, before, " ");
  planGap(plan, after, " ");
}

function planSpacing(visible: string, franceSpacing: boolean): SpacingPlan {
  const plan: SpacingPlan = new Map();
  const quoteRoles = straightQuoteRoles(visible);
  const highPunctuationSpacing: Spacing = franceSpacing ? " " : "";
  const isSpeakerLine = OPENS_WITH_SPEAKER_DASH.test(visible);
  for (const match of visible.matchAll(MANAGED_MARK_PATTERN)) {
    const mark = markAt(visible, match[0], match.index);
    const { before, after } = mark;
    switch (mark.text[0]) {
      case "?":
      case "!":
      case "‽":
      case ";":
        spaceHighPunctuation(plan, visible, mark, highPunctuationSpacing);
        break;
      case ":":
        spaceColon(plan, visible, mark);
        break;
      case "«":
      case "‹":
        if (BEFORE_OPENING_GUILLEMET.test(before.left) || quoteRoles.get(before.start - 1) === "close") planGap(plan, before, " ");
        planGap(plan, after, " ");
        break;
      case "»":
      case "›":
        planGap(plan, before, " ");
        if (WORD_START.test(after.right)) planGap(plan, after, " ");
        break;
      case "“":
      case "‘":
      case "(":
      case "[":
        planGap(plan, after, "");
        break;
      case "”":
      case ")":
      case "]":
        planGap(plan, before, "");
        break;
      case '"': {
        const role = quoteRoles.get(mark.start);
        if (role === "open") planGap(plan, after, "");
        else if (role === "close") planGap(plan, before, "");
        break;
      }
      case ",":
        spaceComma(plan, visible, mark);
        break;
      case ".":
      case "…":
        if (mark.text === ".") spacePeriod(plan, mark);
        else spaceEllipsis(plan, mark);
        break;
      case "—":
      case "–":
        if (!isSpeakerLine) spaceDash(plan, mark);
        break;
      default:
        if (DIGIT.test(before.left)) planGap(plan, before, " ");
    }
  }
  return plan;
}

function applySpacing({ visible, marks }: MarkedText, plan: SpacingPlan): string {
  let output = "";
  let copied = 0;
  let nextMark = 0;

  const copyUntil = (end: number): void => {
    for (; nextMark < marks.length && marks[nextMark]!.at < end; nextMark++) {
      const mark = marks[nextMark]!;
      output += visible.slice(copied, mark.at) + mark.raw;
      copied = mark.at;
    }
    output += visible.slice(copied, end);
    copied = end;
  };

  for (const [start, { end, spacing }] of [...plan].sort((a, b) => a[0] - b[0])) {
    copyUntil(start);
    const enclosed: MarkedText["marks"] = [];
    while (nextMark < marks.length && marks[nextMark]!.at <= end) enclosed.push(marks[nextMark++]!);
    const firstNonClosing = enclosed.findIndex((mark) => !mark.closing);
    const split = firstNonClosing < 0 ? enclosed.length : firstNonClosing;
    const raw = (list: MarkedText["marks"]): string => list.map((mark) => mark.raw).join("");
    output += raw(enclosed.slice(0, split)) + spacing + raw(enclosed.slice(split));
    copied = end;
  }
  copyUntil(visible.length);
  return output + marks.slice(nextMark).map((mark) => mark.raw).join("");
}

export function typesetFrench(text: string, franceSpacing: boolean): string {
  const normalized = text.replace(COMPATIBILITY_PUNCTUATION, (mark) => mark.normalize("NFKC"));
  const marked = localizeNumbers(separateMarkup(normalized));
  return applySpacing(marked, planSpacing(maskLiterals(marked.visible), franceSpacing));
}
