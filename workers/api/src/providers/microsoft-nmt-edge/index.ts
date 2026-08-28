import { ProviderResultChunk, ProviderTranslateOptions, TranslationProvider } from "../types";
import { Chapter, Cue, Unit, Span } from "../../core/types";
import { normalizeMicrosoftLang } from "./langCodes";
import { resolveEdgeUserAgent, callMicrosoftApi } from "./transport";
import {
  protectContentHtml,
  restoreFormattingTags,
  GROUP_MARKER_TEMPLATE,
  GROUP_MARKER_PATTERN,
  UNIT_MARKER_TEMPLATE,
  UNIT_MARKER_PATTERN,
  CUE_MARKER_TEMPLATE,
  CUE_MARKER_PATTERN,
  parseTranslatedHtml,
  escapeHtml,
  unescapeHtml,
  TAG_PATTERN,
} from "./markerEngine";
import { merge } from "../../core/bilingualMerge";
import { coreLog } from "../../core/log";

const DEFAULT_BATCH_CHARS = 4000;
const DEFAULT_CONCURRENCY = 16;
const LENGTH_RATIO_MIN = 0.15;
const LENGTH_RATIO_MAX = 6.0;

function contentLength(text: string): number {
  const matches = (text || "").match(/\p{L}|\p{N}/gu);
  return matches ? matches.length : 0;
}

function hasContent(text: string): boolean {
  return contentLength(text) > 0;
}

function isLengthPlausible(sourceText: string, translatedText: string): boolean {
  const sourceLen = contentLength(sourceText);
  if (sourceLen === 0) return true;
  const ratio = contentLength(translatedText) / sourceLen;
  return ratio >= LENGTH_RATIO_MIN && ratio <= LENGTH_RATIO_MAX;
}

interface GroupItem {
  id: number;
  text: string;
  html: string;
}

function splitOversized<T extends { text: string }>(items: T[], limit: number): { pieces: T[][]; oversized: T[] } {
  const pieces: T[][] = [];
  let piece: T[] = [];
  let pieceChars = 0;
  const oversized: T[] = [];

  for (const item of items) {
    const itemChars = item.text.length;
    if (itemChars > limit) {
      oversized.push(item);
      continue;
    }
    if (piece.length > 0 && pieceChars + itemChars > limit) {
      pieces.push(piece);
      piece = [];
      pieceChars = 0;
    }
    piece.push(item);
    pieceChars += itemChars;
  }
  if (piece.length > 0) {
    pieces.push(piece);
  }
  return { pieces, oversized };
}

function buildSegmentGroups(
  items: GroupItem[],
  chapterGroups: number[][],
  segmentChars: number
): { segments: GroupItem[][][]; oversized: GroupItem[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const segments: GroupItem[][][] = [];
  const oversized: GroupItem[] = [];
  let current: GroupItem[][] = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length > 0) segments.push(current);
    current = [];
    currentChars = 0;
  };

  const limit = Math.max(segmentChars, 100);

  for (const group of chapterGroups) {
    const groupItems: GroupItem[] = [];
    for (const id of group) {
      const it = byId.get(id);
      if (it) groupItems.push(it);
    }
    if (groupItems.length === 0) continue;
    const groupChars = groupItems.reduce((acc, it) => acc + it.text.length, 0);

    if (groupChars > limit) {
      flush();
      const { pieces, oversized: groupOversized } = splitOversized(groupItems, limit);
      for (const piece of pieces) {
        segments.push([piece]);
      }
      oversized.push(...groupOversized);
    } else if (currentChars + groupChars > limit) {
      flush();
      current = [groupItems];
      currentChars = groupChars;
    } else {
      current.push(groupItems);
      currentChars += groupChars;
    }
  }
  flush();
  return { segments, oversized };
}

function buildRequests(segments: GroupItem[][][], arraySize: number = 1): GroupItem[][][][] {
  const requests: GroupItem[][][][] = [];
  const chunkSize = Math.max(arraySize, 1);
  for (let i = 0; i < segments.length; i += chunkSize) {
    requests.push(segments.slice(i, i + chunkSize));
  }
  return requests;
}

function splitCueChunks(text: string): Record<number, string> {
  const parts = (text || "").split(/⟦c(\d+)⟧/g);
  const result: Record<number, string> = {};
  const seen = new Set<number>();
  for (let i = 1; i < parts.length; i += 2) {
    const cid = parseInt(parts[i]!, 10);
    if (seen.has(cid)) continue;
    seen.add(cid);
    result[cid] = (parts[i + 1] || "").trim();
  }
  return result;
}

function expectedCueIds(unit: Unit): number[] {
  return (unit.spans || []).filter((s) => s.boundary === "marker").map((s) => s.id);
}

function missingCueIds(unit: Unit, text: string): number[] {
  const expected = expectedCueIds(unit);
  if (expected.length === 0) return [];
  const present = splitCueChunks(text);
  return expected.filter((cid) => !(cid in present));
}

function patchMissingCues(text: string, expectedIds: number[], recovered: Record<number, string>): string {
  if (!recovered || Object.keys(recovered).length === 0) return text;
  const chunks = splitCueChunks(text);
  Object.assign(chunks, recovered);
  let res = "";
  for (const cid of expectedIds) {
    if (cid in chunks) {
      res += `${CUE_MARKER_TEMPLATE(cid)}${chunks[cid]}`;
    }
  }
  return res || text;
}

async function retryWindowed(
  units: Unit[],
  suspectId: number,
  sourceLang: string,
  targetLang: string,
  batchChars: number,
  userAgent: string
): Promise<Record<number, string>> {
  const index = units.findIndex((u) => u.id === suspectId);
  if (index === -1) return {};
  const window = units.slice(Math.max(0, index - 20), index + 21);
  if (window.length < 2) return {};

  const windowedText = window
    .map((unit) => `${UNIT_MARKER_TEMPLATE(unit.id)}${protectContentHtml(unit.text, unit.term_matches || [])}`)
    .join("");

  if (windowedText.length > batchChars) return {};

  try {
    const resp = await callMicrosoftApi([windowedText], sourceLang, targetLang, userAgent);
    if (!resp || resp.length === 0 || !resp[0]?.translations?.[0]) return {};
    const translatedHtml = resp[0].translations[0].text;
    const flat = unescapeHtml(translatedHtml.replace(TAG_PATTERN, ""));
    const chunks: Record<number, string> = {};
    const parts = flat.split(UNIT_MARKER_PATTERN);
    for (let i = 1; i < parts.length; i += 2) {
      const key = parseInt(parts[i]!, 10);
      if (!isNaN(key)) chunks[key] = (parts[i + 1] || "").trim();
    }

    const keepIds = new Set(units.slice(Math.max(0, index - 2), index + 3).map((u) => u.id));
    const unitById = new Map(window.map((u) => [u.id, u]));
    const recovered: Record<number, string> = {};
    for (const [uidStr, text] of Object.entries(chunks)) {
      const uid = Number(uidStr);
      const unit = unitById.get(uid);
      if (unit && keepIds.has(uid) && isLengthPlausible(unit.text, text)) {
        recovered[uid] = text;
      }
    }
    return recovered;
  } catch {
    return {};
  }
}

async function retryIsolatedCues(
  missingIds: number[],
  cueOrder: number[],
  cueTextById: Map<number, string>,
  cueTermMatches: Map<number, Array<{ start: number; end: number; target?: string }>>,
  sourceLang: string,
  targetLang: string,
  batchChars: number,
  userAgent: string
): Promise<Record<number, string>> {
  const position = new Map(cueOrder.map((cid, i) => [cid, i]));
  const positions = missingIds.map((cid) => position.get(cid)).filter((p): p is number => p !== undefined).sort((a, b) => a - b);
  if (positions.length === 0) return {};

  const lo = Math.max(0, positions[0]! - 5);
  const hi = Math.min(cueOrder.length - 1, positions[positions.length - 1]! + 5);

  let html = "";
  for (let i = lo; i <= hi; i++) {
    const cid = cueOrder[i]!;
    const text = cueTextById.get(cid);
    if (text !== undefined) {
      const matches = cueTermMatches.get(cid) || [];
      html += `${CUE_MARKER_TEMPLATE(cid)}${protectContentHtml(text, matches)}`;
    }
  }

  if (html.length > batchChars) return {};

  try {
    const resp = await callMicrosoftApi([html], sourceLang, targetLang, userAgent);
    if (!resp || resp.length === 0 || !resp[0]?.translations?.[0]) return {};
    const translatedHtml = resp[0].translations[0].text;
    const markerRes = parseTranslatedHtml(translatedHtml, CUE_MARKER_PATTERN);
    const recovered: Record<number, string> = {};

    for (const cid of missingIds) {
      const cand = markerRes[cid];
      const orig = cueTextById.get(cid) || "";
      if (cand && isLengthPlausible(orig, cand)) {
        recovered[cid] = cand;
      }
    }
    return recovered;
  } catch {
    return {};
  }
}

export class MicrosoftNmtEdgeProvider implements TranslationProvider {
  async *translate(
    units: Unit[],
    chapters: Chapter[],
    cues: Cue[],
    options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const batchChars = options.maxChars ? Math.max(500, Math.min(options.maxChars, DEFAULT_BATCH_CHARS)) : DEFAULT_BATCH_CHARS;
    const targetLang = normalizeMicrosoftLang(options.targetLang);
    let requestedSourceLang = normalizeMicrosoftLang(options.sourceLang);
    let currentSourceLang = requestedSourceLang;
    const userAgent = resolveEdgeUserAgent(options.clientUserAgent);
    const log = (message: string) => {
      options.onLog?.(message);
      coreLog("translate", message);
    };

    const resolvedUnits = new Map<number, string>();
    const pendingUnits: Unit[] = [];
    for (const u of units) {
      if (u.resolved !== null && u.resolved !== undefined) {
        resolvedUnits.set(u.id, u.resolved);
      } else {
        pendingUnits.push(u);
      }
    }

    const chapterOfUnit = new Map<number, number>();
    for (const chapter of chapters) {
      for (const uid of chapter.unit_ids) {
        chapterOfUnit.set(uid, chapter.id);
      }
    }

    const items: GroupItem[] = [];
    const chapterGroupsMap = new Map<number, number[]>();

    for (const unit of pendingUnits) {
      const cid = chapterOfUnit.get(unit.id) ?? 0;
      const htmlText = protectContentHtml(unit.text, unit.term_matches || []);
      items.push({ id: unit.id, text: unit.text, html: htmlText });

      if (!chapterGroupsMap.has(cid)) {
        chapterGroupsMap.set(cid, []);
      }
      chapterGroupsMap.get(cid)!.push(unit.id);
    }

    const { segments, oversized } = buildSegmentGroups(items, Array.from(chapterGroupsMap.values()), batchChars);
    const batches = buildRequests(segments, 1);

    log(`Microsoft Edge NMT: Translating ${pendingUnits.length} units in ${batches.length} batches (batch size ${batchChars}, concurrency ${DEFAULT_CONCURRENCY})`);

    const cumulativeTranslations: Record<string, string> = {};
    for (const [k, v] of resolvedUnits) {
      if (typeof v === "string" && v) cumulativeTranslations[String(k)] = v;
    }

    const queue: Record<number, string>[] = [];
    let resolveQueue: (() => void) | null = null;
    let isDone = false;
    const emittedCueIds = new Set<number>();

    const pushChunk = (chunk: Record<number, string>) => {
      queue.push(chunk);
      if (resolveQueue) {
        resolveQueue();
        resolveQueue = null;
      }
    };

    const translateBatchJob = async (batch: GroupItem[][][]): Promise<Record<number, string>> => {
      const allItems = batch.flatMap((segment) => segment.flatMap((group) => group));
      const expectedIds = new Set(allItems.map((i) => i.id));
      const result: Record<number, string> = {};
      const missing = new Set(expectedIds);

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const payload: string[] = [];
          for (let segIdx = 0; segIdx < batch.length; segIdx++) {
            const segment = batch[segIdx]!;
            let segmentStr = "";
            for (const group of segment) {
              for (const item of group) {
                segmentStr += `${GROUP_MARKER_TEMPLATE(item.id)}${item.html}`;
              }
            }
            payload.push(segmentStr);
          }

          const resp = await callMicrosoftApi(payload, currentSourceLang, targetLang, userAgent);
          if (Array.isArray(resp) && resp.length > 0) {
            if (currentSourceLang === "" && resp[0]?.detectedLanguage?.language) {
              currentSourceLang = normalizeMicrosoftLang(resp[0].detectedLanguage.language);
              log(`Microsoft Edge NMT: Auto-detected source language "${currentSourceLang}"`);
            }

            for (const rItem of resp) {
              if (rItem.translations && rItem.translations.length > 0) {
                const html = rItem.translations[0]!.text;
                const markerRes = parseTranslatedHtml(html, GROUP_MARKER_PATTERN);
                for (const [idxStr, text] of Object.entries(markerRes)) {
                  const idx = Number(idxStr);
                  if (expectedIds.has(idx)) {
                    result[idx] = text;
                    missing.delete(idx);
                  }
                }
              }
            }
          }

          if (missing.size === 0) break;
        } catch (e: any) {
          if (attempt === 3) break;
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }

      if (allItems.length > 1 && missing.size > 0) {
        const byId = new Map(allItems.map((i) => [i.id, i]));
        for (const uid of Array.from(missing)) {
          const item = byId.get(uid);
          if (!item) continue;
          try {
            const soloPayload = `${GROUP_MARKER_TEMPLATE(item.id)}${item.html}`;
            const soloResp = await callMicrosoftApi([soloPayload], currentSourceLang, targetLang, userAgent);
            if (soloResp && soloResp[0]?.translations?.[0]) {
              const markerRes = parseTranslatedHtml(soloResp[0].translations[0].text, GROUP_MARKER_PATTERN);
              if (markerRes[uid]) {
                result[uid] = markerRes[uid]!;
                missing.delete(uid);
              }
            }
          } catch {}
        }
      }

      return result;
    };

    const taskPromise = (async () => {
      let currentIndex = 0;
      const workerCount = Math.min(DEFAULT_CONCURRENCY, Math.max(1, batches.length));

      const worker = async () => {
        while (currentIndex < batches.length) {
          const index = currentIndex++;
          const batch = batches[index]!;
          const batchRes = await translateBatchJob(batch);
          pushChunk(batchRes);
        }
      };

      const workers: Promise<void>[] = [];
      for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    })().finally(() => {
      isDone = true;
      if (resolveQueue) resolveQueue();
    });

    while (!isDone || queue.length > 0) {
      if (queue.length > 0) {
        const chunk = queue.shift()!;
        for (const [k, v] of Object.entries(chunk)) {
          if (typeof v === "string" && v) {
            cumulativeTranslations[String(k)] = v;
          }
        }

        const merged = await merge(cues, units, cumulativeTranslations, currentSourceLang, targetLang);
        const deltaCues = merged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));

        if (deltaCues.length > 0) {
          for (const c of deltaCues) emittedCueIds.add(c.id);
          yield {
            cues: deltaCues,
            approx_splits: merged.approx_splits,
            missing_count: merged.missing_count,
            missing_cues: merged.missing_cues,
            quality_warnings: merged.quality_warnings,
            resolvedSourceLang: currentSourceLang,
            provider: "microsoft-nmt-edge",
          };
        }
      } else {
        await new Promise<void>((resolve) => {
          resolveQueue = resolve;
        });
      }
    }

    await taskPromise;

    const unitById = new Map(units.map((u) => [u.id, u]));
    const lengthSuspects = new Set<number>();
    const cueSuspects = new Set<number>();

    for (const unit of pendingUnits) {
      const text = cumulativeTranslations[String(unit.id)];
      if (text && hasContent(unit.text)) {
        if (!hasContent(text) || !isLengthPlausible(unit.text, text)) {
          lengthSuspects.add(unit.id);
        }
        if (missingCueIds(unit, text).length > 0) {
          cueSuspects.add(unit.id);
        }
      }
    }

    const cueOrder = cues.map((c) => c.id);
    const cueTextById = new Map(cues.map((c) => [c.id, c.text]));
    const cueTermMatches = new Map<number, Array<{ start: number; end: number; target?: string }>>();

    for (const unit of units) {
      const spans = unit.spans || [];
      const termMatches = unit.term_matches || [];
      if (spans.length <= 1) {
        for (const span of spans) cueTermMatches.set(span.id, termMatches);
      } else {
        let cursor = 0;
        for (const span of spans) {
          const pos = unit.text.indexOf(span.text, cursor);
          if (pos === -1) {
            cueTermMatches.set(span.id, []);
            continue;
          }
          const start = pos;
          const end = pos + span.text.length;
          cursor = end;
          cueTermMatches.set(
            span.id,
            termMatches
              .filter((m) => start <= m.start && m.end <= end)
              .map((m) => ({ start: m.start - start, end: m.end - start, target: m.target }))
          );
        }
      }
    }

    const allSuspects = Array.from(new Set([...lengthSuspects, ...cueSuspects])).sort((a, b) => a - b);

    for (const uid of allSuspects) {
      const unit = unitById.get(uid);
      if (!unit) continue;

      const recovered = await retryWindowed(units, uid, currentSourceLang, targetLang, batchChars, userAgent);
      for (const [ridStr, text] of Object.entries(recovered)) {
        if (typeof text === "string" && text) {
          cumulativeTranslations[ridStr] = text;
        }
      }

      let currentText = cumulativeTranslations[String(uid)] || "";
      const remainingCues = missingCueIds(unit, currentText);
      if (remainingCues.length > 0) {
        const recoveredCues = await retryIsolatedCues(
          remainingCues,
          cueOrder,
          cueTextById,
          cueTermMatches,
          currentSourceLang,
          targetLang,
          batchChars,
          userAgent
        );
        if (Object.keys(recoveredCues).length > 0) {
          cumulativeTranslations[String(uid)] = patchMissingCues(currentText, expectedCueIds(unit), recoveredCues);
        }
      }
    }

    const cleanedTranslations: Record<string, string> = {};
    for (const [k, v] of Object.entries(cumulativeTranslations)) {
      if (typeof v === "string" && v.trim().length > 0) {
        cleanedTranslations[k] = restoreFormattingTags(v).trim();
      }
    }

    const finalMerged = await merge(cues, units, cleanedTranslations, currentSourceLang, targetLang, log);
    const finalDeltaCues = finalMerged.cues.filter((c) => c.translation !== null && !emittedCueIds.has(c.id));
    for (const c of finalDeltaCues) emittedCueIds.add(c.id);

    yield {
      cues: finalDeltaCues,
      approx_splits: finalMerged.approx_splits,
      missing_count: finalMerged.missing_count,
      missing_cues: finalMerged.missing_cues,
      quality_warnings: finalMerged.quality_warnings,
      resolvedSourceLang: currentSourceLang,
      provider: "microsoft-nmt-edge",
    };
  }
}
