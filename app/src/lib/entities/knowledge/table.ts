import type { NerEntity } from "../../models/ner/decode";
import { isSentenceInitial, type Token } from "./tokens";

export type EntityVerdict = "settled" | "pending" | "rejected";

export interface TokenStat {
  plain: number;
  entity: number;
  initial: number;
}

interface SpanStat {
  accepted: number;
  rejected: number;
}

export interface KnowledgeSnapshot {
  exact: [string, number, number, number][];
  folded: [string, number, number, number][];
  spans: [string, number, number][];
  lowercaseSeen: number;
  lowercaseInEntity: number;
}

export interface KnowledgeTable {
  exact(text: string): TokenStat | undefined;
  folded(key: string): TokenStat | undefined;
  isSettledSpan(spanKey: string): boolean;
  lowercaseEntityRate(): { seen: number; rate: number };
  observe(text: string, tokens: readonly Token[], entities: readonly NerEntity[], verdicts: readonly EntityVerdict[]): void;
  snapshot(): KnowledgeSnapshot;
}

const SPAN_SEPARATOR = "\u0000";
const REJECTIONS_TO_SETTLE = 2;

export const spanKeyOf = (tokens: readonly Token[]): string => tokens.map(({ key }) => key).join(SPAN_SEPARATOR);

const isLowercaseWord = (token: Token): boolean => !token.numeric && token.text === token.text.toLowerCase() && token.text !== token.text.toUpperCase();

const isTitleStart = (token: Token): boolean => token.text[0] !== token.text[0].toLowerCase();

function bump(map: Map<string, TokenStat>, key: string, inside: boolean, sentenceInitial: boolean): void {
  const stat = map.get(key) ?? { plain: 0, entity: 0, initial: 0 };
  if (inside) stat.entity += 1;
  else if (sentenceInitial) stat.initial += 1;
  else stat.plain += 1;
  map.set(key, stat);
}

const restoreStats = (rows: readonly [string, number, number, number][] | undefined): Map<string, TokenStat> => new Map((rows ?? []).map(([key, plain, entity, initial]) => [key, { plain, entity, initial }]));

export function createKnowledgeTable(restored?: KnowledgeSnapshot): KnowledgeTable {
  const exact = restoreStats(restored?.exact);
  const folded = restoreStats(restored?.folded);
  const spans = new Map<string, SpanStat>((restored?.spans ?? []).map(([key, accepted, rejected]) => [key, { accepted, rejected }]));
  let lowercaseSeen = restored?.lowercaseSeen ?? 0;
  let lowercaseInEntity = restored?.lowercaseInEntity ?? 0;

  const recordSpan = (key: string, verdict: EntityVerdict): void => {
    if (verdict === "pending") return;
    const stat = spans.get(key) ?? { accepted: 0, rejected: 0 };
    if (verdict === "settled") stat.accepted += 1;
    else stat.rejected += 1;
    spans.set(key, stat);
  };

  return {
    exact: (text) => exact.get(text.normalize("NFKC")),
    folded: (key) => folded.get(key),
    isSettledSpan(spanKey) {
      const stat = spans.get(spanKey);
      return stat !== undefined && (stat.accepted > 0 || stat.rejected >= REJECTIONS_TO_SETTLE);
    },
    lowercaseEntityRate: () => ({ seen: lowercaseSeen, rate: lowercaseSeen ? lowercaseInEntity / lowercaseSeen : 0 }),
    observe(text, tokens, entities, verdicts) {
      const inside = new Set<number>();
      entities.forEach((entity, index) => {
        const covered = tokens.flatMap((token, position) => (token.start < entity.end && entity.start < token.end ? [position] : []));
        if (!covered.length) return;
        covered.forEach((position) => inside.add(position));
        recordSpan(spanKeyOf(covered.map((position) => tokens[position])), verdicts[index]);
      });
      tokens.forEach((token, position) => {
        if (token.numeric) return;
        const within = inside.has(position);
        const sentenceInitial = isTitleStart(token) && isSentenceInitial(text, tokens, position);
        bump(exact, token.text.normalize("NFKC"), within, sentenceInitial);
        bump(folded, token.key, within, sentenceInitial);
        if (isLowercaseWord(token)) {
          lowercaseSeen += 1;
          if (within) lowercaseInEntity += 1;
        }
      });
    },
    snapshot: () => ({
      exact: [...exact].map(([key, stat]) => [key, stat.plain, stat.entity, stat.initial]),
      folded: [...folded].map(([key, stat]) => [key, stat.plain, stat.entity, stat.initial]),
      spans: [...spans].map(([key, stat]) => [key, stat.accepted, stat.rejected]),
      lowercaseSeen,
      lowercaseInEntity,
    }),
  };
}
