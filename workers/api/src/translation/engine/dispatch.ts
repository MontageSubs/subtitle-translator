import { errorMessage } from "../../telemetry/log";
import type { Route } from "./adapter";
import { runPool, deadlineSignal } from "./concurrency";
import { dedupeByPayload, propagateAliases } from "./dedupe";
import { dedupePayloadList, packByChars } from "./packing";
import { sendGuarded, type EngineSession } from "./session";

async function resolveChunk(
  session: EngineSession, payloads: string[], indices: number[], route: Route, signal: AbortSignal
): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  if (!indices.length || session.budget.exhausted) return resolved;
  try {
    const texts = await sendGuarded(session, indices.map((i) => payloads[i]!), route, signal);
    if (texts && texts.length === indices.length) {
      indices.forEach((payloadIndex, k) => {
        if (texts[k] !== null) resolved.set(payloadIndex, texts[k]!);
      });
      return resolved;
    }
  } catch (error) {
    session.log(`packed jobs chunk failed: ${errorMessage(error)}`);
  }
  if (indices.length === 1 || !session.dialect.transport.splitsOnFailure) return resolved;

  const mid = indices.length >> 1;
  const halves = await Promise.all([
    resolveChunk(session, payloads, indices.slice(0, mid), route, signal),
    resolveChunk(session, payloads, indices.slice(mid), route, signal),
  ]);
  for (const half of halves) for (const [index, text] of half) resolved.set(index, text);
  return resolved;
}

export async function dispatchPayloads(session: EngineSession, payloads: string[], route: Route): Promise<(string | null)[]> {
  const { uniquePayloads, slotOf } = dedupePayloadList(payloads);
  const results: (string | null)[] = new Array(uniquePayloads.length).fill(null);
  if (!uniquePayloads.length) return slotOf.map(() => null);
  const signal = deadlineSignal(session.job.startedAt);
  await runPool(packByChars(uniquePayloads, session.requestChars), session.dialect.poolSize, async (indices) => {
    if (session.budget.exhausted) return;
    for (const [index, text] of await resolveChunk(session, uniquePayloads, indices, route, signal)) results[index] = text;
  });
  return slotOf.map((slot) => results[slot]!);
}

type Kind = "primary" | "speculative";

function attachSpeculative(
  primary: Map<number, string>, speculative: Map<number, string>, chunks: number[][], ids: number[], maxChars: number
): number[][] {
  const used = new Set<number>();
  const entries = [...speculative];
  let borrow = 0;
  return chunks.map((chunk) => {
    let chars = chunk.reduce((sum, i) => sum + primary.get(ids[i]!)!.length, 0);
    const attached: number[] = [];
    const take = (id: number, payload: string) => {
      attached.push(id);
      used.add(id);
      chars += payload.length;
    };
    for (const i of chunk) {
      const id = ids[i]!;
      const payload = speculative.get(id);
      if (payload !== undefined && !used.has(id) && chars + payload.length <= maxChars) take(id, payload);
    }
    while (borrow < entries.length) {
      const [id, payload] = entries[borrow]!;
      if (used.has(id)) {
        borrow++;
        continue;
      }
      if (chars + payload.length > maxChars) break;
      take(id, payload);
      borrow++;
    }
    return attached;
  });
}

export interface LookaheadResults {
  primary: Map<number, string>;
  speculative: Map<number, string>;
}

export async function dispatchWithLookahead(
  session: EngineSession, primaryPayloads: Map<number, string>, speculativePayloads: Map<number, string>, route: Route
): Promise<LookaheadResults> {
  const { unique: primaryUnique, aliasOf: primaryAlias } = dedupeByPayload(primaryPayloads);
  const { unique: speculativeUnique, aliasOf: speculativeAlias } = dedupeByPayload(speculativePayloads);
  const results: LookaheadResults = { primary: new Map(), speculative: new Map() };
  const ids = [...primaryUnique.keys()];
  if (!ids.length) return results;

  const chunks = packByChars(ids.map((id) => primaryUnique.get(id)!), session.requestChars);
  const attached = attachSpeculative(primaryUnique, speculativeUnique, chunks, ids, session.requestChars);
  const signal = deadlineSignal(session.job.startedAt);

  await runPool(chunks, session.dialect.poolSize, async (chunk, chunkIndex) => {
    if (session.budget.exhausted) return;
    const items: { id: number; kind: Kind; payload: string }[] = [
      ...chunk.map((i) => ({ id: ids[i]!, kind: "primary" as const, payload: primaryUnique.get(ids[i]!)! })),
      ...attached[chunkIndex]!.map((id) => ({ id, kind: "speculative" as const, payload: speculativeUnique.get(id)! })),
    ];
    const resolved = await resolveChunk(session, items.map((item) => item.payload), items.map((_, i) => i), route, signal);
    for (const [i, text] of resolved) results[items[i]!.kind].set(items[i]!.id, text);
  });

  propagateAliases(results.primary, primaryAlias);
  propagateAliases(results.speculative, speculativeAlias);
  return results;
}
