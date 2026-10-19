import type { Unit } from "../../../subtitle/types";
import { cuesOfUnitIds, failureCode } from "../../engine/cueIds";
import type { InitialPass } from "../../engine/adapter";
import { SUBREQUEST_LIMIT, reserveInitialDispatch } from "../../engine/budget";
import { groupUnitsByChapter, packChapters } from "../../engine/chapters";
import { delay, runPool, deadlineSignal } from "../../engine/concurrency";
import { groupMarker } from "../../engine/markedParse";
import { routeFor } from "../../engine/session";
import { charLength, escapeHtml, hasContent } from "../../engine/text";
import { parseBatchResponse } from "./batchParse";
import { sendGoogleHtml, type GoogleHtmlTransport } from "./transport";

const MAX_BATCH_ATTEMPTS = 3;
const BATCH_RETRY_DELAY_MS = 3000;
const BATCH_FANOUT_CONCURRENCY = 6;
const EMPTY_INDEX = new Map<number, number>();

interface Item {
  id: number;
  text: string;
  html: string;
}

const spanMarkup = (html: string, index: number | string): string => `<span id=${index}>${groupMarker(index)}${html}</span>`;

function chapterHtml(group: Item[], indexOf: ReadonlyMap<number, number>, contextHtml: string | undefined): string {
  const prefix = contextHtml ? spanMarkup(contextHtml, "ctx") : "";
  return `<div>${prefix}${group.map((item) => spanMarkup(item.html, indexOf.get(item.id)!)).join("")}</div>`;
}

export function createInitialPass(raw: GoogleHtmlTransport, userAgent: string | undefined): InitialPass {
  return async (session, pending, context, publish) => {
    const { dialect, budget, trace, job } = session;
    const contextHtml = context ? escapeHtml(context) : undefined;
    const items: Item[] = pending.map((unit: Unit) => ({
      id: unit.id,
      text: unit.text,
      html: dialect.encode(unit.text, unit.term_matches),
    }));
    const indexDigits = String(items.length).length;
    const itemOverhead = charLength(spanMarkup("", 10 ** (indexDigits - 1)));
    const packing = packChapters(
      items,
      groupUnitsByChapter(pending.map((unit) => unit.id), session.chapterOf),
      session.requestChars,
      (item) => itemOverhead + charLength(item.html),
      charLength(chapterHtml([], EMPTY_INDEX, contextHtml))
    );
    const batches = reserveInitialDispatch(packing.batches, SUBREQUEST_LIMIT, (kept, total) =>
      trace?.emit({ e: "cap", kept, total })
    );
    if (trace) {
      for (const item of packing.oversized) trace.emit({ e: "skip", cues: cuesOfUnitIds(session.unitById, [item.id]) });
      trace.emit({ e: "plan", provider: dialect.id, batches: batches.map((batch) => cuesOfUnitIds(session.unitById, batch.flat().map((item) => item.id))) });
    }
    const translations = new Map<number, string>();
    const signal = deadlineSignal(job.startedAt);

    const translateBatch = async (batch: Item[][], position: number): Promise<{ parsed: Map<number, string>; attempts: number }> => {
      const members = batch.flat();
      const indexOf = new Map(members.map((item, i) => [item.id, i + 1]));
      const sourceByIndex = new Map(members.map((item) => [indexOf.get(item.id)!, item.text]));
      const idByIndex = new Map(members.map((item) => [indexOf.get(item.id)!, item.id]));
      let parsed = new Map<number, string>();
      let attempts = 0;

      for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
        attempts = attempt;
        const html = batch.map((group) => chapterHtml(group, indexOf, attempt === 1 ? contextHtml : undefined)).join("");
        try {
          budget.consume();
          const translatedHtml = await sendGoogleHtml(raw, { html, route: routeFor(session), userAgent, signal, onDetected: (lang) => session.source.note(lang) });
          parsed = new Map();
          for (const [index, text] of parseBatchResponse(translatedHtml, sourceByIndex)) {
            const id = idByIndex.get(index)!;
            if (hasContent(text) || !hasContent(sourceByIndex.get(index))) parsed.set(id, text);
          }
        } catch (error) {
          trace?.fail("batch", failureCode(error), position);
          parsed = new Map();
        }
        if (members.length <= parsed.size) break;
        if (attempt < MAX_BATCH_ATTEMPTS && !budget.exhausted) await delay(BATCH_RETRY_DELAY_MS);
      }
      return { parsed, attempts };
    };

    await runPool(batches, BATCH_FANOUT_CONCURRENCY, async (batch, i) => {
      const { parsed, attempts } = await translateBatch(batch, i + 1);
      if (trace && (attempts > 1 || parsed.size < batch.flat().length)) {
        trace.batch(i + 1, batches.length, cuesOfUnitIds(session.unitById, batch.flat().map((item) => item.id).filter((id) => !parsed.has(id))), attempts);
      }
      if (!parsed.size) return;
      const chunk = new Map<number, string>();
      for (const [id, text] of parsed) {
        const unit = session.unitById.get(id)!;
        const finished = dialect.applyTerms(text, unit.text, unit.term_matches, session.targetRules);
        translations.set(id, finished);
        chunk.set(id, finished);
      }
      publish(chunk);
    });
    return translations;
  };
}
