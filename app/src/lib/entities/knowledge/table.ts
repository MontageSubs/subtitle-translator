import type { NerEntity } from "../../models/ner/decode";
import { isSentenceInitial, type Token } from "./tokens";

export type EntityVerdict = "settled" | "pending" | "rejected";

export interface TokenStat {
  plain: number;
  entity: number;
  initial: number;
}

interface LinkStat {
  separated: number;
  merged: number;
}

export interface KnowledgeSnapshot {
  exact: [string, number, number, number][];
  folded: [string, number, number, number][];
  spans: string[];
  links: [string, number, number][];
  strongEntities: number;
  strongLowercase: number;
}

export interface Observation {
  text: string;
  tokens: readonly Token[];
  entities: readonly NerEntity[];
  verdicts: readonly EntityVerdict[];
  strong: readonly boolean[];
  informative: boolean;
}

export interface KnowledgeTable {
  exact(form: string): TokenStat | undefined;
  folded(key: string): TokenStat | undefined;
  settledSpanLength(text: string, tokens: readonly Token[], index: number): number;
  connectorSeparates(key: string): boolean;
  casingReliability(): { seen: number; lowercaseShare: number };
  observe(observation: Observation): void;
  snapshot(): KnowledgeSnapshot;
}

const SPAN_SEPARATOR = "\u0000";
const SPAN_GAP_PATTERN = /^[\s.\-'’·•・]*$/;
const MIN_SEPARATIONS = 2;
const MERGE_TOLERANCE = 3;

const spanKeyOf = (tokens: readonly Token[]): string => tokens.map(({ key }) => key).join(SPAN_SEPARATOR);

const isLowercaseStart = (token: Token): boolean => token.text[0] === token.text[0].toLowerCase() && token.text[0] !== token.text[0].toUpperCase();

const isTitleStart = (token: Token): boolean => token.text[0] !== token.text[0].toLowerCase();

function bump(map: Map<string, TokenStat>, key: string, inside: boolean, sentenceInitial: boolean): void {
  const stat = map.get(key) ?? { plain: 0, entity: 0, initial: 0 };
  if (inside) stat.entity += 1;
  else if (sentenceInitial) stat.initial += 1;
  else stat.plain += 1;
  map.set(key, stat);
}

const restoreStats = (rows: readonly [string, number, number, number][] | undefined): Map<string, TokenStat> => new Map((rows ?? []).map(([key, plain, entity, initial]) => [key, { plain, entity, initial }]));

function coveredPositions(tokens: readonly Token[], entity: NerEntity): number[] {
  const covered: number[] = [];
  for (let position = 0; position < tokens.length; position++) if (tokens[position].start < entity.end && entity.start < tokens[position].end) covered.push(position);
  return covered;
}

export function createKnowledgeTable(restored?: KnowledgeSnapshot): KnowledgeTable {
  const exact = restoreStats(restored?.exact);
  const folded = restoreStats(restored?.folded);
  const spans = new Set<string>(restored?.spans);
  const links = new Map<string, LinkStat>((restored?.links ?? []).map(([key, separated, merged]) => [key, { separated, merged }]));
  const heads = new Map<string, string[][]>();
  let strongEntities = restored?.strongEntities ?? 0;
  let strongLowercase = restored?.strongLowercase ?? 0;

  const indexSpan = (key: string): void => {
    const parts = key.split(SPAN_SEPARATOR);
    const candidates = heads.get(parts[0]) ?? [];
    candidates.push(parts);
    candidates.sort((left, right) => right.length - left.length);
    heads.set(parts[0], candidates);
  };

  const settleSpan = (key: string): void => {
    if (spans.has(key)) return;
    spans.add(key);
    indexSpan(key);
  };

  const noteLink = (key: string, kind: keyof LinkStat): void => {
    const stat = links.get(key) ?? { separated: 0, merged: 0 };
    stat[kind] += 1;
    links.set(key, stat);
  };

  spans.forEach(indexSpan);

  return {
    exact: (form) => exact.get(form),
    folded: (key) => folded.get(key),
    settledSpanLength(text, tokens, index) {
      const candidates = heads.get(tokens[index].key);
      if (!candidates) return 0;
      for (const keys of candidates) {
        if (index + keys.length > tokens.length) continue;
        let matches = true;
        for (let offset = 1; offset < keys.length && matches; offset++) {
          const left = tokens[index + offset - 1];
          const right = tokens[index + offset];
          matches = right.key === keys[offset] && SPAN_GAP_PATTERN.test(text.slice(left.end, right.start));
        }
        if (matches) return keys.length;
      }
      return 0;
    },
    connectorSeparates(key) {
      const stat = links.get(key);
      return stat !== undefined && stat.separated >= MIN_SEPARATIONS && stat.separated > MERGE_TOLERANCE * stat.merged;
    },
    casingReliability: () => ({ seen: strongEntities, lowercaseShare: strongEntities ? strongLowercase / strongEntities : 0 }),
    observe({ text, tokens, entities, verdicts, strong, informative }) {
      const inside = new Set<number>();
      let previousLast: number | null = null;
      entities.forEach((entity, index) => {
        const covered = coveredPositions(tokens, entity);
        if (!covered.length) return;
        const first = covered[0];
        const last = covered[covered.length - 1];
        if (informative && strong[index]) {
          strongEntities += 1;
          if (isLowercaseStart(tokens[first])) strongLowercase += 1;
        }
        if (verdicts[index] === "rejected") {
          previousLast = null;
          return;
        }
        if (verdicts[index] === "settled") settleSpan(spanKeyOf(covered.map((position) => tokens[position])));
        const titled = !isLowercaseStart(tokens[first]) && !isLowercaseStart(tokens[last]);
        for (const position of covered) {
          if (titled && position > first && position < last && isLowercaseStart(tokens[position])) noteLink(tokens[position].key, "merged");
          else inside.add(position);
        }
        if (previousLast !== null && first === previousLast + 2 && isLowercaseStart(tokens[first - 1])) noteLink(tokens[first - 1].key, "separated");
        previousLast = last;
      });
      tokens.forEach((token, position) => {
        if (token.numeric) return;
        const within = inside.has(position);
        const sentenceInitial = isTitleStart(token) && isSentenceInitial(text, tokens, position);
        bump(exact, token.form, within, sentenceInitial);
        bump(folded, token.key, within, sentenceInitial);
      });
    },
    snapshot: () => ({
      exact: [...exact].map(([key, stat]) => [key, stat.plain, stat.entity, stat.initial]),
      folded: [...folded].map(([key, stat]) => [key, stat.plain, stat.entity, stat.initial]),
      spans: [...spans],
      links: [...links].map(([key, stat]) => [key, stat.separated, stat.merged]),
      strongEntities,
      strongLowercase,
    }),
  };
}
