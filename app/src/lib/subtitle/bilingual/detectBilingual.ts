import { normalizeDetectedCode } from "../../../utils/detect";
import type { Cue, SubtitleFormat } from "../types";
import { selectableTagFor } from "../variants/trackLanguage";
import { dominantScript, ScriptClass, scriptShare } from "./scriptClass";
import { SideHeaders, serializeSideCues } from "./sideDocument";
import { consistentLanguage, languagesOfTexts } from "./sideLanguage";
import { splitStackedCue } from "./splitCue";
import { buildTimelineEvents, TimelineEvent } from "./timelineEvents";
import { pairByTimeline } from "./timelinePairs";

export interface BilingualSide {
  language: string | null;
  text: string;
  cueCount: number;
  preview: string;
}

export interface BilingualSplit {
  first: BilingualSide;
  second: BilingualSide;
}

interface Row {
  text: string;
  cues: Cue[];
}

interface RowPair {
  first: Row;
  second: Row;
  whole?: Row;
}

interface Bucket {
  cues: Cue[];
  texts: string[];
}

interface SidePlan {
  pairs: RowPair[];
  leftovers: Row[];
  coverage: number;
}

interface Arrangement {
  first: Bucket;
  second: Bucket;
  shared: Cue[];
}

const MIN_EVENTS = 6;
const MIN_COVERAGE = 0.35;
const MIN_ROW_LETTERS = 16;
const LETTER = /\p{L}/u;
const LETTERS = /\p{L}/gu;

const hasLetters = (cue: Cue): boolean => LETTER.test(cue.text);
const emptyBucket = (): Bucket => ({ cues: [], texts: [] });
const letterCount = (text: string): number => text.match(LETTERS)?.length ?? 0;

function place(bucket: Bucket, row: Row): void {
  bucket.texts.push(row.text);
  bucket.cues.push(...row.cues);
}

const rowOfEvent = (event: TimelineEvent): Row => ({ text: event.text, cues: event.cues });

function majorityScript(texts: readonly string[]): ScriptClass | null {
  const counts = new Map<ScriptClass, number>();
  for (const text of texts) {
    const script = dominantScript(text);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

type Orientation = "aligned" | "swapped" | "indistinct";

function orientationOf(pair: RowPair, firstScript: ScriptClass, secondScript: ScriptClass): Orientation {
  const firstShare = scriptShare(pair.first.text, firstScript, secondScript);
  const secondShare = scriptShare(pair.second.text, firstScript, secondScript);
  if (firstShare === null || secondShare === null) return "indistinct";
  if (firstScript === "latin" || secondScript === "latin") {
    const [firstNativeShare, secondNativeShare] = firstScript === "latin" ? [1 - firstShare, 1 - secondShare] : [firstShare, secondShare];
    const firstIsNative = firstNativeShare > 0 && secondNativeShare === 0;
    const secondIsNative = secondNativeShare > 0 && firstNativeShare === 0;
    if (!firstIsNative && !secondIsNative) return "indistinct";
    return firstIsNative === (firstScript !== "latin") ? "aligned" : "swapped";
  }
  if (firstShare === secondShare) return "indistinct";
  return firstShare > secondShare ? "aligned" : "swapped";
}

function scriptsOfPairs(pairs: readonly RowPair[]): [ScriptClass | null, ScriptClass | null] {
  return [majorityScript(pairs.map(({ first }) => first.text)), majorityScript(pairs.map(({ second }) => second.text))];
}

function scriptSeparatedPlan(pairs: readonly RowPair[], leftovers: Row[], eventCount: number, weight: number): SidePlan | null {
  const [firstScript, secondScript] = scriptsOfPairs(pairs);
  const separated = firstScript !== null && secondScript !== null && firstScript !== secondScript;
  const accepted: RowPair[] = [];
  for (const pair of pairs) {
    const orientation = separated ? orientationOf(pair, firstScript, secondScript) : "aligned";
    if (orientation === "aligned") accepted.push(pair);
    else if (orientation === "swapped") accepted.push({ first: pair.second, second: pair.first, whole: pair.whole });
    else leftovers.push(...(pair.whole ? [pair.whole] : [pair.first, pair.second]));
  }
  const coverage = (accepted.length * weight) / eventCount;
  return accepted.length >= MIN_EVENTS && coverage >= MIN_COVERAGE ? { pairs: accepted, leftovers, coverage } : null;
}

function stackedPlan(events: readonly TimelineEvent[]): SidePlan | null {
  const pairs: RowPair[] = [];
  const leftovers: Row[] = [];
  for (const event of events) {
    const parts = event.cues.map((cue) => splitStackedCue(cue));
    if (!parts.every((part): part is NonNullable<typeof part> => part !== null)) {
      leftovers.push(rowOfEvent(event));
      continue;
    }
    pairs.push({
      first: { text: parts[0].first.text, cues: parts.map((part) => part.first) },
      second: { text: parts[0].second.text, cues: parts.map((part) => part.second) },
      whole: rowOfEvent(event),
    });
  }
  return scriptSeparatedPlan(pairs, leftovers, events.length, 1);
}

function pairedPlan(events: readonly TimelineEvent[]): SidePlan | null {
  const { pairs, unpaired } = pairByTimeline(events);
  if (pairs.length < MIN_EVENTS) return null;
  const rowPairs = pairs.map(({ earlier, later }): RowPair => ({ first: rowOfEvent(earlier), second: rowOfEvent(later) }));
  return scriptSeparatedPlan(rowPairs, unpaired.map(rowOfEvent), events.length, 2);
}

function textsOf(pairs: readonly RowPair[]): [string[], string[]] {
  return [pairs.map(({ first }) => first.text), pairs.map(({ second }) => second.text)];
}

async function verifiedLanguages(plan: SidePlan): Promise<[string | null, string | null] | null> {
  const [firstTexts, secondTexts] = textsOf(plan.pairs);
  const [firstLanguage, secondLanguage] = await Promise.all([consistentLanguage(firstTexts), consistentLanguage(secondTexts)]);
  if (firstLanguage && secondLanguage) return firstLanguage === secondLanguage ? null : [firstLanguage, secondLanguage];
  const [firstScript, secondScript] = scriptsOfPairs(plan.pairs);
  return firstScript && secondScript && firstScript !== secondScript ? [firstLanguage, secondLanguage] : null;
}

function arrangeAsPlanned(pairs: readonly RowPair[]): Arrangement {
  const arrangement: Arrangement = { first: emptyBucket(), second: emptyBucket(), shared: [] };
  for (const { first, second } of pairs) {
    place(arrangement.first, first);
    place(arrangement.second, second);
  }
  return arrangement;
}

async function arrangeByRowLanguages(pairs: readonly RowPair[], languages: readonly [string, string]): Promise<Arrangement> {
  const rows = pairs.flatMap(({ first, second }) => [first, second]);
  const eligible = rows.flatMap((row, index) => (letterCount(row.text) >= MIN_ROW_LETTERS ? [index] : []));
  const detected = await languagesOfTexts(eligible.map((index) => rows[index].text));
  const rowLanguages: (string | null)[] = rows.map(() => null);
  eligible.forEach((index, position) => { rowLanguages[index] = detected[position]; });
  const arrangement: Arrangement = { first: emptyBucket(), second: emptyBucket(), shared: [] };
  const sideOf = (language: string | null): Bucket | null => (language === languages[0] ? arrangement.first : language === languages[1] ? arrangement.second : null);
  pairs.forEach((pair, index) => {
    const [firstLanguage, secondLanguage] = [rowLanguages[index * 2], rowLanguages[index * 2 + 1]];
    const firstSide = sideOf(firstLanguage);
    const secondSide = sideOf(secondLanguage);
    if (firstSide && firstSide === secondSide && pair.whole) place(firstSide, pair.whole);
    else if (firstSide && secondSide) {
      place(firstSide, pair.first);
      place(secondSide, pair.second);
    } else {
      place(arrangement.first, pair.first);
      place(arrangement.second, pair.second);
    }
  });
  return arrangement;
}

async function arrange(pairs: readonly RowPair[], languages: readonly [string | null, string | null]): Promise<Arrangement> {
  const [firstScript, secondScript] = scriptsOfPairs(pairs);
  const scriptsDiffer = firstScript !== secondScript;
  const [firstLanguage, secondLanguage] = languages;
  if (scriptsDiffer || !firstLanguage || !secondLanguage) return arrangeAsPlanned(pairs);
  return arrangeByRowLanguages(pairs, [firstLanguage, secondLanguage]);
}

function sideByScript(text: string, firstScript: ScriptClass, secondScript: ScriptClass): "first" | "second" | null {
  const share = scriptShare(text, firstScript, secondScript);
  if (share === null) return null;
  if (firstScript === "latin") return share < 1 ? "second" : "first";
  if (secondScript === "latin") return share > 0 ? "first" : "second";
  return share === 0.5 ? null : share > 0.5 ? "first" : "second";
}

async function attributeLeftovers(arrangement: Arrangement, leftovers: readonly Row[], languages: readonly [string | null, string | null]): Promise<void> {
  const firstScript = majorityScript(arrangement.first.texts);
  const secondScript = majorityScript(arrangement.second.texts);
  const scriptsDiffer = firstScript !== null && secondScript !== null && firstScript !== secondScript;
  const ambiguous: Row[] = [];
  for (const row of leftovers) {
    const side = scriptsDiffer ? sideByScript(row.text, firstScript, secondScript) : null;
    if (side === null) ambiguous.push(row);
    else place(side === "first" ? arrangement.first : arrangement.second, row);
  }
  if (!ambiguous.length) return;
  const detected = languages[0] && languages[1] ? await languagesOfTexts(ambiguous.map((row) => row.text)) : [];
  ambiguous.forEach((row, index) => {
    if (detected[index] === languages[0]) place(arrangement.first, row);
    else if (detected[index] === languages[1]) place(arrangement.second, row);
    else arrangement.shared.push(...row.cues);
  });
}

const byStart = (a: Cue, b: Cue): number => a.start_ms - b.start_ms;

function sideOf(format: SubtitleFormat, cues: readonly Cue[], shared: readonly Cue[], language: string | null, headers: SideHeaders): BilingualSide {
  const sequential = [...cues, ...shared].sort(byStart).map((cue, index) => ({ ...cue, id: index + 1 }));
  return {
    language: language ? selectableTagFor(normalizeDetectedCode(language)) : null,
    text: serializeSideCues(format, sequential, headers),
    cueCount: sequential.length,
    preview: sequential.find(hasLetters)?.text ?? "",
  };
}

export async function detectBilingual(format: SubtitleFormat, cues: readonly Cue[]): Promise<BilingualSplit | null> {
  const significant = cues.filter(hasLetters);
  const events = buildTimelineEvents(significant);
  if (events.length < MIN_EVENTS) return null;
  const candidates = [stackedPlan(events), pairedPlan(events)].filter((plan): plan is SidePlan => plan !== null).sort((a, b) => b.coverage - a.coverage);
  const headers: SideHeaders = { assHeader: cues[0]?.assHeader, vttHeader: cues[0]?.vttHeader };
  const neutral = cues.filter((cue) => !hasLetters(cue));
  for (const plan of candidates) {
    const languages = await verifiedLanguages(plan);
    if (!languages) continue;
    const arrangement = await arrange(plan.pairs, languages);
    await attributeLeftovers(arrangement, plan.leftovers, languages);
    const shared = [...neutral, ...arrangement.shared];
    return {
      first: sideOf(format, arrangement.first.cues, shared, languages[0], headers),
      second: sideOf(format, arrangement.second.cues, shared, languages[1], headers),
    };
  }
  return null;
}
