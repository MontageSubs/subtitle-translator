import { detectSourceLanguage, normalizeDetectedCode } from "../../../utils/detect";
import { baseLanguage } from "../common/languageCodes";
import type { Cue, SubtitleFormat } from "../types";
import { selectableTagFor } from "../variants/trackLanguage";
import { dominantScript, ScriptClass } from "./scriptClass";
import { SideHeaders, serializeSideCues } from "./sideDocument";
import { splitStackedCue } from "./splitCue";

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

interface SidePair {
  firstCues: Cue[];
  secondCues: Cue[];
  coverage: number;
}

const MIN_COVERAGE = 0.6;
const MIN_COVERED_CUES = 6;
const PAIR_TIME_TOLERANCE_MS = 50;
const SAMPLE_CHUNKS = 4;
const MIN_CHUNK_CUES = 3;
const MIN_AGREEMENT = 0.75;
const LETTER = /\p{L}/u;

const hasLetters = (cue: Cue): boolean => LETTER.test(cue.text);

function stackedPair(cues: readonly Cue[]): SidePair | null {
  const firstCues: Cue[] = [];
  const secondCues: Cue[] = [];
  const unsplit: Cue[] = [];
  for (const cue of cues) {
    const split = splitStackedCue(cue);
    if (split) {
      firstCues.push(split.first);
      secondCues.push(split.second);
    } else unsplit.push(cue);
  }
  const significant = cues.length;
  if (firstCues.length < MIN_COVERED_CUES || firstCues.length / significant < MIN_COVERAGE) return null;
  return { ...distributeUnsplit(firstCues, secondCues, unsplit), coverage: firstCues.length / significant };
}

function pairedPair(cues: readonly Cue[]): SidePair | null {
  const firstCues: Cue[] = [];
  const secondCues: Cue[] = [];
  const unpaired: Cue[] = [];
  for (let index = 0; index < cues.length; index++) {
    const current = cues[index];
    const next = cues[index + 1];
    const isPair = next && Math.abs(current.start_ms - next.start_ms) <= PAIR_TIME_TOLERANCE_MS && Math.abs(current.end_ms - next.end_ms) <= PAIR_TIME_TOLERANCE_MS;
    if (isPair) {
      firstCues.push(current);
      secondCues.push(next);
      index += 1;
    } else unpaired.push(current);
  }
  if (firstCues.length < MIN_COVERED_CUES || (firstCues.length * 2) / cues.length < MIN_COVERAGE) return null;
  return { ...distributeUnsplit(firstCues, secondCues, unpaired), coverage: (firstCues.length * 2) / cues.length };
}

function topScript(cues: readonly Cue[]): ScriptClass | null {
  const counts = new Map<ScriptClass, number>();
  for (const cue of cues) {
    const script = dominantScript(cue.text);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function distributeUnsplit(firstCues: Cue[], secondCues: Cue[], leftovers: readonly Cue[]): { firstCues: Cue[]; secondCues: Cue[] } {
  if (!leftovers.length) return { firstCues, secondCues };
  const firstScript = topScript(firstCues);
  const secondScript = topScript(secondCues);
  const first = [...firstCues];
  const second = [...secondCues];
  for (const cue of leftovers) {
    const script = dominantScript(cue.text);
    (script !== null && script === secondScript && script !== firstScript ? second : first).push(cue);
  }
  const byStart = (a: Cue, b: Cue): number => a.start_ms - b.start_ms;
  return { firstCues: first.sort(byStart), secondCues: second.sort(byStart) };
}

function chunksOf(cues: readonly Cue[]): Cue[][] {
  const size = Math.max(MIN_CHUNK_CUES, Math.ceil(cues.length / SAMPLE_CHUNKS));
  return Array.from({ length: Math.ceil(cues.length / size) }, (_, index) => cues.slice(index * size, (index + 1) * size));
}

async function consistentLanguage(cues: readonly Cue[]): Promise<string | null> {
  const detections = await Promise.all(chunksOf(cues).map((chunk) => detectSourceLanguage(chunk)));
  const reliable = detections.flatMap((result) => (result?.reliable ? [baseLanguage(result.code)] : []));
  if (reliable.length < 2 && cues.length >= SAMPLE_CHUNKS * MIN_CHUNK_CUES) return null;
  if (!reliable.length) return null;
  const tally = new Map<string, number>();
  for (const language of reliable) tally.set(language, (tally.get(language) ?? 0) + 1);
  const [leader, votes] = [...tally].sort((a, b) => b[1] - a[1])[0];
  return votes / reliable.length >= MIN_AGREEMENT ? leader : null;
}

async function detectedTag(cues: readonly Cue[]): Promise<string | null> {
  const result = await detectSourceLanguage(cues);
  return result ? selectableTagFor(normalizeDetectedCode(result.code)) : null;
}

function withSequentialIds(cues: readonly Cue[]): Cue[] {
  return cues.map((cue, index) => ({ ...cue, id: index + 1 }));
}

async function sideOf(format: SubtitleFormat, cues: readonly Cue[], headers: SideHeaders): Promise<BilingualSide> {
  const sequential = withSequentialIds(cues);
  return { language: await detectedTag(sequential), text: serializeSideCues(format, sequential, headers), cueCount: sequential.length, preview: sequential[0]?.text ?? "" };
}

export async function detectBilingual(format: SubtitleFormat, cues: readonly Cue[]): Promise<BilingualSplit | null> {
  const significant = cues.filter(hasLetters);
  if (significant.length < MIN_COVERED_CUES) return null;
  const candidates = [stackedPair(significant), pairedPair(significant)].filter((pair): pair is SidePair => pair !== null).sort((a, b) => b.coverage - a.coverage);
  const headers: SideHeaders = { assHeader: cues[0]?.assHeader, vttHeader: cues[0]?.vttHeader };
  for (const { firstCues, secondCues } of candidates) {
    const [firstLanguage, secondLanguage] = await Promise.all([consistentLanguage(firstCues), consistentLanguage(secondCues)]);
    if (!firstLanguage || !secondLanguage || firstLanguage === secondLanguage) continue;
    const [first, second] = await Promise.all([sideOf(format, firstCues, headers), sideOf(format, secondCues, headers)]);
    return { first, second };
  }
  return null;
}
