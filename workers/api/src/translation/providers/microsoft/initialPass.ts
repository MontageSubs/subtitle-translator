import { logBatchOutcome } from "../../engine/batchLog";
import { countCues, failureLabel, unitCues, unitsCues } from "../../engine/cueLabels";
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
    log(() => `dispatch capped batches=${kept}/${total}`)
  );
  for (const item of packing.oversized) log(() => `dispatch oversized skipped cues=${unitCues(session.unitById.get(item.id)!)}`);
  log(() => `dispatch provider=microsoft cues=${countCues(pending)} batches=${segments.length}`);

  const contextHtml = context ? escapeHtml(context) : "";
  const signal = deadlineSignal(job.startedAt);
  const translations = new Map<number, string>();

  await runPool(segments, MAIN_CONCURRENCY, async (segment, index) => {
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
      log(() => `dispatch batch failed cues=${unitsCues(ids.map((id) => session.unitById.get(id)!))} error=${failureLabel(error)}`);
    }
    for (const [id, text] of chunk) translations.set(id, text);
    logBatchOutcome(log, { label: `${index + 1}/${segments.length}`, received: chunk, units: () => ids.map((id) => session.unitById.get(id)!) });
    publish(chunk);
  });
  return translations;
};
