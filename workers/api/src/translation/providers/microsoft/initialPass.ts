import { errorMessage } from "../../../telemetry/log";
import type { InitialPass } from "../../engine/adapter";
import { SUBREQUEST_LIMIT, reserveInitialDispatch } from "../../engine/budget";
import { groupUnitsByChapter, packChapters } from "../../engine/chapters";
import { deadlineSignal, runPool } from "../../engine/concurrency";
import { GROUP_MARKER_PATTERN, groupMarker, parseMarked } from "../../engine/markedParse";
import { routeFor, sendGuarded } from "../../engine/session";
import { charLength, escapeHtml } from "../../engine/text";
import { restoreFormattingTags } from "./formatting";

const MIN_SEGMENT_CHARS = 100;
const MAIN_CONCURRENCY = 19;

interface Item {
  id: number;
  html: string;
}

const itemCost = (item: Item): number => charLength(groupMarker(item.id)) + charLength(item.html);

export const initialPass: InitialPass = async (session, pending, context, publish) => {
  const { dialect, log, job } = session;
  const items: Item[] = pending.map((unit) => ({ id: unit.id, html: dialect.encode(unit.text, unit.term_matches) }));
  const packing = packChapters(
    items, groupUnitsByChapter(pending.map((unit) => unit.id), session.chapterOf), Math.max(session.requestChars, MIN_SEGMENT_CHARS), itemCost, 0
  );
  const segments = reserveInitialDispatch(packing.batches, SUBREQUEST_LIMIT, (kept, total) =>
    log(`Limiting initial dispatch to ${kept} segments (was ${total}) to reserve room for recovery passes.`)
  );
  for (const item of packing.oversized) log(`unit ${item.id}: ${item.html.length} chars exceeds maxChars (${session.requestChars}), cue-level content cannot be split further, skipping`);
  log(`Microsoft Edge NMT: Translating ${pending.length} units across ${segments.length} requests (batch size ${session.requestChars}, concurrency ${MAIN_CONCURRENCY})`);

  const contextHtml = context ? escapeHtml(context) : "";
  const signal = deadlineSignal(job.startedAt);
  const translations = new Map<number, string>();

  await runPool(segments, MAIN_CONCURRENCY, async (segment) => {
    const members = segment.flat();
    const ids = members.map((item) => item.id);
    const body = members.map((item) => `${groupMarker(item.id)}${item.html}`).join("");
    const payload = contextHtml ? `${contextHtml}${body}` : body;
    const chunk = new Map<number, string>();
    try {
      const [flat] = await sendGuarded(session, [payload], routeFor(session), signal) ?? [];
      if (flat) {
        const expected = new Set(ids);
        for (const [key, text] of parseMarked(flat, GROUP_MARKER_PATTERN, "t", ids, restoreFormattingTags)) {
          const id = Number(key);
          if (expected.has(id)) chunk.set(id, text);
        }
      }
    } catch (error) {
      log(`segment request failed (units ${ids[0]}..${ids[ids.length - 1]}): ${errorMessage(error)}, deferring to consolidated recovery pass`);
    }
    for (const [id, text] of chunk) translations.set(id, text);
    publish(chunk);
  });
  return translations;
};
