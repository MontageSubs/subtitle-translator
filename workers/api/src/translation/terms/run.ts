import { SubrequestBudget } from "../engine/budget";
import { deadlineSignal, runPool } from "../engine/concurrency";
import { hasContent, isLengthPlausible } from "../engine/text";
import type { TermInput, TermOutcome, TermTransport } from "./types";

const POOL_SIZE = 6;
const RETRY_ROUNDS = 1;
const ITEM_OVERHEAD_CHARS = 16;
const MAX_TRANSLATION_CHARS = 200;
const CONTAMINATED_PATTERN = /[\r\n<>\u2045\u2046]/;
const WHITESPACE_PATTERN = /\s+/g;

export interface TermRun {
  transport: TermTransport;
  requestChars: number;
  budget: SubrequestBudget;
  startedAt: number;
}

function acceptedTranslation(source: string, translation: string | null): string | null {
  if (translation === null || CONTAMINATED_PATTERN.test(translation)) return null;
  const clean = translation.replace(WHITESPACE_PATTERN, " ").trim();
  if (!clean || clean.length > MAX_TRANSLATION_CHARS) return null;
  return hasContent(clean) && isLengthPlausible(source, clean) ? clean : null;
}

function planBatches(items: readonly TermInput[], requestChars: number, maxItems: number): TermInput[][] {
  const batches: TermInput[][] = [];
  let current: TermInput[] = [];
  let chars = 0;
  for (const item of items) {
    const cost = item.text.length + ITEM_OVERHEAD_CHARS;
    if (current.length && (current.length >= maxItems || chars + cost > requestChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += cost;
  }
  if (current.length) batches.push(current);
  return batches;
}

class BatchSettler {
  readonly accepted = new Map<number, string>();
  lastError: unknown = null;

  constructor(private readonly run: TermRun, private readonly signal: AbortSignal) {}

  async settle(batch: TermInput[]): Promise<TermInput[]> {
    const { budget, transport } = this.run;
    if (budget.exhausted) return batch;
    let translations: (string | null)[] | null;
    try {
      budget.consume();
      translations = await transport.send(batch.map(({ text }) => text), this.signal);
    } catch (error) {
      this.lastError = error;
      return batch;
    }
    if (translations === null || translations.length !== batch.length) return this.splitOrFail(batch);
    return batch.filter((item, index) => {
      const clean = acceptedTranslation(item.text, translations[index] ?? null);
      if (clean !== null) this.accepted.set(item.id, clean);
      return clean === null;
    });
  }

  private async splitOrFail(batch: TermInput[]): Promise<TermInput[]> {
    if (batch.length === 1 || !this.run.transport.splitsOnFailure) return batch;
    const middle = Math.ceil(batch.length / 2);
    const halves = await Promise.all([this.settle(batch.slice(0, middle)), this.settle(batch.slice(middle))]);
    return halves.flat();
  }
}

export async function translateTerms(terms: readonly TermInput[], run: TermRun): Promise<TermOutcome> {
  const settler = new BatchSettler(run, deadlineSignal(run.startedAt));
  let pending = [...terms];
  for (let round = 0; round <= RETRY_ROUNDS && pending.length; round++) {
    const failed: TermInput[] = [];
    await runPool(planBatches(pending, run.requestChars, run.transport.maxItems), POOL_SIZE, async (batch) => {
      failed.push(...(await settler.settle(batch)));
    });
    pending = failed;
  }
  if (!settler.accepted.size && settler.lastError) throw settler.lastError;
  const unresolved = new Set(pending.map(({ id }) => id));
  return {
    results: terms.filter(({ id }) => settler.accepted.has(id)).map(({ id }) => ({ id, translation: settler.accepted.get(id)! })),
    failed: terms.filter(({ id }) => unresolved.has(id)).map(({ id }) => id),
  };
}
