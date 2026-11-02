import type { RecognitionProfile } from "../profile";
import type { KnowledgeTable, TokenStat } from "./table";
import { isSentenceInitial, type Token } from "./tokens";
import type { WordPriors } from "./priors";

export interface GateContext {
  table: KnowledgeTable;
  priors: WordPriors;
  profile: RecognitionProfile;
  scriptWords: ReadonlySet<string>;
  documentCased: boolean;
}

export type GateDecision = { kind: "skip" } | { kind: "names"; spans: readonly (readonly Token[])[] } | { kind: "run"; reasons: readonly string[] };

type TokenState = "plain" | "entity" | "unknown" | "provisional" | "name";

const PLAIN_EVIDENCE = 2;
const COMMON_EVIDENCE = 1;
const NAME_LIKE_EVIDENCE = 3;
const RELAXED_EVIDENCE = 3;
const MIN_CASE_SAMPLE = 30;
const MAX_LOWERCASE_ENTITY_SHARE = 0.35;
const RUN_GAP_PATTERN = /^[\s\-'’·•・]*$/;
const UPPERCASE_TEST = /\p{Lu}/u;
const LOWERCASE_TEST = /\p{Ll}/u;

const isTitleCase = (text: string): boolean => text[0] !== text[0].toLowerCase() && text.slice(1) === text.slice(1).toLowerCase();
const isLowercaseStart = (text: string): boolean => text[0] === text[0].toLowerCase() && text[0] !== text[0].toUpperCase();

const evidenceNeeded = (key: string, priors: WordPriors): number => {
  if (priors.isNameLike(key)) return NAME_LIKE_EVIDENCE;
  return priors.isCommon(key) ? COMMON_EVIDENCE : PLAIN_EVIDENCE;
};

function caseIsInformative(text: string, context: GateContext): boolean {
  if (!context.profile.cased || !LOWERCASE_TEST.test(text)) return false;
  return UPPERCASE_TEST.test(text) || documentCasingTrusted(context);
}

function documentCasingTrusted({ table, documentCased }: GateContext): boolean {
  if (!documentCased) return false;
  const { seen, lowercaseShare } = table.casingReliability();
  return seen < MIN_CASE_SAMPLE || lowercaseShare <= MAX_LOWERCASE_ENTITY_SHARE;
}

const plainEvidence = (stat: TokenStat, initial: boolean): number => stat.plain + (initial ? stat.initial : 0);

const isEntityLike = (state: TokenState): boolean => state === "entity" || state === "name";

const adjacent = (text: string, left: Token, right: Token): boolean => RUN_GAP_PATTERN.test(text.slice(left.end, right.start));

function classifyFolded(token: Token, initial: boolean, context: GateContext): TokenState {
  const { table, priors, profile } = context;
  const known = profile.cased && priors.isPlain(token.key);
  const stat = table.folded(token.key);
  if (!stat) return known ? "plain" : "unknown";
  if (stat.entity > 0) return plainEvidence(stat, initial) > 0 ? "unknown" : "entity";
  return known || plainEvidence(stat, initial) >= evidenceNeeded(token.key, priors) ? "plain" : "unknown";
}

function classifyExact(token: Token, initial: boolean, context: GateContext): TokenState {
  const { table, priors, scriptWords } = context;
  const stat = table.exact(token.form);
  if (stat) {
    if (stat.entity > 0) return plainEvidence(stat, initial) > 0 ? "unknown" : "entity";
    if (plainEvidence(stat, initial) >= evidenceNeeded(token.key, priors)) return "plain";
  }
  const foldedStat = table.folded(token.key);
  if (foldedStat && foldedStat.entity > 0) return "entity";
  if (isLowercaseStart(token.text)) return priors.isPlain(token.key) || documentCasingTrusted(context) ? "provisional" : "unknown";
  if (!initial) return "unknown";
  if (priors.isPlain(token.key)) return "plain";
  if (priors.isNameLike(token.key)) return "unknown";
  const lowerStat = table.exact(token.key);
  if (lowerStat && lowerStat.entity === 0 && lowerStat.plain >= RELAXED_EVIDENCE) return "plain";
  return documentCasingTrusted(context) && scriptWords.has(token.key) ? "provisional" : "unknown";
}

function isCertainName(token: Token, initial: boolean, soleWord: boolean, context: GateContext): boolean {
  const { priors, table, scriptWords } = context;
  if ((initial && !soleWord) || !isTitleCase(token.text) || !priors.isNameLike(token.key)) return false;
  return !priors.isCommon(token.key) && !scriptWords.has(token.key) && !table.folded(token.key) && documentCasingTrusted(context);
}

function classifyAll(text: string, tokens: readonly Token[], exact: boolean, context: GateContext): TokenState[] {
  const soleWord = tokens.filter((token) => !token.numeric).length === 1;
  return tokens.map((token, index) => {
    if (token.numeric) return "plain";
    const initial = isSentenceInitial(text, tokens, index);
    if (exact && isCertainName(token, initial, soleWord, context)) return "name";
    return exact ? classifyExact(token, initial, context) : classifyFolded(token, initial, context);
  });
}

function coverSettledSpans(text: string, tokens: readonly Token[], states: TokenState[], table: KnowledgeTable): number[] {
  const owners = tokens.map(() => -1);
  for (let index = 0; index < tokens.length; ) {
    const length = table.settledSpanLength(text, tokens, index);
    if (!length) {
      index += 1;
      continue;
    }
    for (let offset = 0; offset < length; offset++) {
      states[index + offset] = "entity";
      owners[index + offset] = index;
    }
    index += length;
  }
  return owners;
}

function settleProvisionals(text: string, tokens: readonly Token[], states: TokenState[], table: KnowledgeTable): void {
  states.forEach((state, index) => {
    if (state !== "provisional") return;
    const before = index > 0 && isEntityLike(states[index - 1]) && adjacent(text, tokens[index - 1], tokens[index]);
    const after = index + 1 < tokens.length && isEntityLike(states[index + 1]) && adjacent(text, tokens[index], tokens[index + 1]);
    states[index] = before && after && !table.connectorSeparates(tokens[index].key) ? "unknown" : "plain";
  });
}

function unresolvedKeys(text: string, tokens: readonly Token[], states: readonly TokenState[], owners: readonly number[]): string[] {
  const keys: string[] = [];
  tokens.forEach((token, index) => {
    if (states[index] === "unknown" || (states[index] === "entity" && owners[index] < 0)) keys.push(token.key);
    else if (owners[index] >= 0 && index + 1 < tokens.length && owners[index + 1] !== owners[index] && isEntityLike(states[index + 1]) && adjacent(text, token, tokens[index + 1])) keys.push(tokens[index + 1].key);
  });
  return keys;
}

function nameRuns(text: string, tokens: readonly Token[], states: readonly TokenState[]): Token[][] | null {
  const runs: Token[][] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (states[index] !== "name") continue;
    const start = index;
    while (index + 1 < tokens.length && states[index + 1] === "name" && adjacent(text, tokens[index], tokens[index + 1])) index += 1;
    const touchesEntity = (start > 0 && states[start - 1] === "entity" && adjacent(text, tokens[start - 1], tokens[start])) || (index + 1 < tokens.length && states[index + 1] === "entity" && adjacent(text, tokens[index], tokens[index + 1]));
    if (touchesEntity) return null;
    runs.push(tokens.slice(start, index + 1));
  }
  return runs;
}

export function gateSentence(text: string, tokens: readonly Token[], context: GateContext): GateDecision {
  const states = classifyAll(text, tokens, caseIsInformative(text, context), context);
  const owners = coverSettledSpans(text, tokens, states, context.table);
  settleProvisionals(text, tokens, states, context.table);
  const reasons = unresolvedKeys(text, tokens, states, owners);
  if (reasons.length) return { kind: "run", reasons };
  const runs = nameRuns(text, tokens, states);
  if (runs === null) return { kind: "run", reasons: tokens.filter((_, index) => states[index] === "name").map(({ key }) => key) };
  return runs.length ? { kind: "names", spans: runs } : { kind: "skip" };
}
