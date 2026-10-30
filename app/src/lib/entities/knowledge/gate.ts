import type { RecognitionProfile } from "../profile";
import type { KnowledgeTable, TokenStat } from "./table";
import { spanKeyOf } from "./table";
import { isSentenceInitial, type Token } from "./tokens";
import type { WordPriors } from "./priors";

export interface GateContext {
  table: KnowledgeTable;
  priors: WordPriors;
  profile: RecognitionProfile;
  scriptWords: ReadonlySet<string>;
  documentCased: boolean;
}

export type GateDecision = { kind: "skip" } | { kind: "solo"; token: Token } | { kind: "run" };

type TokenState = "plain" | "entity" | "unknown" | "provisional";

const PLAIN_EVIDENCE = 2;
const COMMON_EVIDENCE = 1;
const NAME_LIKE_EVIDENCE = 3;
const RELAXED_EVIDENCE = 3;
const MIN_CASE_SAMPLE = 100;
const MAX_LOWERCASE_ENTITY_RATE = 0.02;
const RUN_GAP_PATTERN = /^[\s\-'’·•・]*$/;
const UPPERCASE_PATTERN = /\p{Lu}/gu;
const LOWERCASE_PATTERN = /\p{Ll}/gu;
const MIN_ALL_CAPS_LETTERS = 2;

const isTitleCase = (text: string): boolean => text[0] !== text[0].toLowerCase() && text.slice(1) === text.slice(1).toLowerCase();
const isLowercaseStart = (text: string): boolean => text[0] === text[0].toLowerCase() && text[0] !== text[0].toUpperCase();

const evidenceNeeded = (key: string, priors: WordPriors): number => {
  if (priors.isNameLike(key)) return NAME_LIKE_EVIDENCE;
  return priors.isCommon(key) ? COMMON_EVIDENCE : PLAIN_EVIDENCE;
};

function caseIsInformative(text: string, context: GateContext): boolean {
  if (!context.profile.cased) return false;
  const upper = text.match(UPPERCASE_PATTERN)?.length ?? 0;
  const lower = text.match(LOWERCASE_PATTERN)?.length ?? 0;
  if (!lower) return false;
  if (!upper) return documentCasingTrusted(context);
  return true;
}

function documentCasingTrusted({ table, documentCased }: GateContext): boolean {
  if (!documentCased) return false;
  const { seen, rate } = table.lowercaseEntityRate();
  return seen < MIN_CASE_SAMPLE || rate <= MAX_LOWERCASE_ENTITY_RATE;
}

export const isAllCapsSentence = (text: string): boolean => (text.match(UPPERCASE_PATTERN)?.length ?? 0) >= MIN_ALL_CAPS_LETTERS && !LOWERCASE_PATTERN.test(text);

const plainEvidence = (stat: TokenStat, initial: boolean): number => stat.plain + (initial ? stat.initial : 0);

function classifyFolded(token: Token, initial: boolean, context: GateContext): TokenState {
  const stat = context.table.folded(token.key);
  if (!stat) return "unknown";
  if (stat.entity > 0) return plainEvidence(stat, initial) > 0 ? "unknown" : "entity";
  return plainEvidence(stat, initial) >= evidenceNeeded(token.key, context.priors) ? "plain" : "unknown";
}

function classifyExact(token: Token, initial: boolean, context: GateContext): TokenState {
  const { table, priors, scriptWords } = context;
  const stat = table.exact(token.text);
  if (stat) {
    if (stat.entity > 0) return plainEvidence(stat, initial) > 0 ? "unknown" : "entity";
    if (plainEvidence(stat, initial) >= evidenceNeeded(token.key, priors)) return "plain";
  }
  const foldedStat = table.folded(token.key);
  if (foldedStat && foldedStat.entity > 0) return "entity";
  if (!context.profile.cased) return "unknown";
  if (isLowercaseStart(token.text)) return documentCasingTrusted(context) ? "provisional" : "unknown";
  if (!initial || priors.isNameLike(token.key)) return "unknown";
  const lowerStat = table.exact(token.key);
  if (lowerStat && lowerStat.entity === 0 && lowerStat.plain >= RELAXED_EVIDENCE) return "plain";
  return documentCasingTrusted(context) && scriptWords.has(token.key) ? "provisional" : "unknown";
}

function classifyAll(text: string, tokens: readonly Token[], exact: boolean, context: GateContext): TokenState[] {
  return tokens.map((token, index) => {
    if (token.numeric) return "plain";
    const initial = isSentenceInitial(text, tokens, index);
    return exact ? classifyExact(token, initial, context) : classifyFolded(token, initial, context);
  });
}

const adjacent = (text: string, left: Token, right: Token): boolean => RUN_GAP_PATTERN.test(text.slice(left.end, right.start));

function settleProvisionals(text: string, tokens: readonly Token[], states: TokenState[]): TokenState[] {
  return states.map((state, index) => {
    if (state !== "provisional") return state;
    const before = index > 0 && states[index - 1] === "entity" && adjacent(text, tokens[index - 1], tokens[index]);
    const after = index + 1 < tokens.length && states[index + 1] === "entity" && adjacent(text, tokens[index], tokens[index + 1]);
    return before && after ? "unknown" : "plain";
  });
}

function entityRunsAreSettled(text: string, tokens: readonly Token[], states: readonly TokenState[], table: KnowledgeTable): boolean {
  let run: Token[] = [];
  const closeRun = (): boolean => {
    const settled = run.length === 0 || table.isSettledSpan(spanKeyOf(run));
    run = [];
    return settled;
  };
  for (let index = 0; index < tokens.length; index++) {
    if (states[index] !== "entity") {
      if (!closeRun()) return false;
      continue;
    }
    if (run.length && !adjacent(text, run[run.length - 1], tokens[index]) && !closeRun()) return false;
    run.push(tokens[index]);
  }
  return closeRun();
}

function isSoloName(tokens: readonly Token[], context: GateContext): boolean {
  const words = tokens.filter((token) => !token.numeric);
  if (words.length !== 1 || !context.profile.cased) return false;
  const [{ text, key }] = words;
  const { priors, table, scriptWords } = context;
  return isTitleCase(text) && priors.isNameLike(key) && !priors.isCommon(key) && !scriptWords.has(key) && !table.folded(key) && documentCasingTrusted(context);
}

export function gateSentence(text: string, tokens: readonly Token[], context: GateContext): GateDecision {
  if (isSoloName(tokens, context)) return { kind: "solo", token: tokens.find((token) => !token.numeric)! };
  const exact = caseIsInformative(text, context);
  const states = settleProvisionals(text, tokens, classifyAll(text, tokens, exact, context));
  if (states.includes("unknown")) return { kind: "run" };
  return entityRunsAreSettled(text, tokens, states, context.table) ? { kind: "skip" } : { kind: "run" };
}
