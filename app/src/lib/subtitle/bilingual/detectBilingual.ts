import { normalizeDetectedCode } from "../../../utils/detect";
import type { Cue, SubtitleFormat } from "../types";
import { selectableTagFor } from "../variants/trackLanguage";
import { closestScript, dominantScript, ScriptClass } from "./scriptClass";
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

interface Bucket {
  cues: Cue[];
  texts: string[];
}

interface SidePlan {
  first: Bucket;
  second: Bucket;
  leftovers: TimelineEvent[];
  coverage: number;
}

const MIN_EVENTS = 6;
const MIN_COVERAGE = 0.35;
const LETTER = /\p{L}/u;

const hasLetters = (cue: Cue): boolean => LETTER.test(cue.text);
const emptyBucket = (): Bucket => ({ cues: [], texts: [] });

function majorityScript(events: readonly TimelineEvent[]): ScriptClass | null {
  const counts = new Map<ScriptClass, number>();
  for (const event of events) {
    const script = dominantScript(event.text);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

type StackedParts = NonNullable<ReturnType<typeof splitStackedCue>>;

interface SplitEvent {
  event: TimelineEvent;
  parts: StackedParts[];
}

function stackedPlan(events: readonly TimelineEvent[]): SidePlan | null {
  const plan: SidePlan = { first: emptyBucket(), second: emptyBucket(), leftovers: [], coverage: 0 };
  const splits: SplitEvent[] = [];
  for (const event of events) {
    const parts = event.cues.map((cue) => splitStackedCue(cue));
    if (parts.every((part): part is StackedParts => part !== null)) splits.push({ event, parts });
    else plan.leftovers.push(event);
  }
  const firstScript = majorityScript(splits.map(({ parts }) => ({ text: parts[0].first.text }) as TimelineEvent));
  const secondScript = majorityScript(splits.map(({ parts }) => ({ text: parts[0].second.text }) as TimelineEvent));
  const scriptsDiffer = firstScript !== null && secondScript !== null && firstScript !== secondScript;
  let accepted = 0;
  for (const { event, parts } of splits) {
    const consistent = !scriptsDiffer || (dominantScript(parts[0].first.text) === firstScript && dominantScript(parts[0].second.text) === secondScript);
    if (!consistent) {
      plan.leftovers.push(event);
      continue;
    }
    accepted += 1;
    plan.first.texts.push(parts[0].first.text);
    plan.second.texts.push(parts[0].second.text);
    for (const part of parts) {
      plan.first.cues.push(part.first);
      plan.second.cues.push(part.second);
    }
  }
  plan.coverage = accepted / events.length;
  return accepted >= MIN_EVENTS && plan.coverage >= MIN_COVERAGE ? plan : null;
}

function pairedPlan(events: readonly TimelineEvent[]): SidePlan | null {
  const { pairs, unpaired } = pairByTimeline(events);
  if (pairs.length < MIN_EVENTS) return null;
  const earlierScript = majorityScript(pairs.map((pair) => pair.earlier));
  const laterScript = majorityScript(pairs.map((pair) => pair.later));
  const scriptsDiffer = earlierScript !== null && laterScript !== null && earlierScript !== laterScript;
  const plan: SidePlan = { first: emptyBucket(), second: emptyBucket(), leftovers: [...unpaired], coverage: 0 };
  let accepted = 0;
  const place = (bucket: Bucket, event: TimelineEvent): void => {
    bucket.texts.push(event.text);
    bucket.cues.push(...event.cues);
  };
  for (const { earlier, later } of pairs) {
    if (!scriptsDiffer) {
      place(plan.first, earlier);
      place(plan.second, later);
      accepted += 1;
      continue;
    }
    const scripts = [dominantScript(earlier.text), dominantScript(later.text)];
    if (scripts[0] === earlierScript && scripts[1] === laterScript) {
      place(plan.first, earlier);
      place(plan.second, later);
      accepted += 1;
    } else if (scripts[0] === laterScript && scripts[1] === earlierScript) {
      place(plan.first, later);
      place(plan.second, earlier);
      accepted += 1;
    } else plan.leftovers.push(earlier, later);
  }
  plan.coverage = (accepted * 2) / events.length;
  return accepted >= MIN_EVENTS && plan.coverage >= MIN_COVERAGE ? plan : null;
}

function scriptsOf(plan: SidePlan): [ScriptClass | null, ScriptClass | null] {
  const dominant = (texts: readonly string[]): ScriptClass | null => majorityScript(texts.map((text) => ({ text }) as TimelineEvent));
  return [dominant(plan.first.texts), dominant(plan.second.texts)];
}

async function attributeLeftovers(plan: SidePlan, languages: readonly [string | null, string | null]): Promise<void> {
  const [firstScript, secondScript] = scriptsOf(plan);
  const scriptsDiffer = firstScript !== secondScript;
  const ambiguous: TimelineEvent[] = [];
  const place = (bucket: Bucket, event: TimelineEvent): void => {
    bucket.texts.push(event.text);
    bucket.cues.push(...event.cues);
  };
  for (const event of plan.leftovers) {
    const script = closestScript(event.text, [firstScript, secondScript]);
    if (scriptsDiffer && script === firstScript) place(plan.first, event);
    else if (scriptsDiffer && script === secondScript) place(plan.second, event);
    else ambiguous.push(event);
  }
  if (!ambiguous.length) return;
  const detected = languages[0] && languages[1] ? await languagesOfTexts(ambiguous.map((event) => event.text)) : [];
  ambiguous.forEach((event, index) => place(detected[index] === languages[1] ? plan.second : plan.first, event));
}

async function verifiedLanguages(plan: SidePlan): Promise<[string | null, string | null] | null> {
  const [firstLanguage, secondLanguage] = await Promise.all([consistentLanguage(plan.first.texts), consistentLanguage(plan.second.texts)]);
  if (firstLanguage && secondLanguage) return firstLanguage === secondLanguage ? null : [firstLanguage, secondLanguage];
  const [firstScript, secondScript] = scriptsOf(plan);
  return firstScript && secondScript && firstScript !== secondScript ? [firstLanguage, secondLanguage] : null;
}

const byStart = (a: Cue, b: Cue): number => a.start_ms - b.start_ms;

function sideOf(format: SubtitleFormat, cues: readonly Cue[], neutral: readonly Cue[], language: string | null, headers: SideHeaders): BilingualSide {
  const sequential = [...cues, ...neutral].sort(byStart).map((cue, index) => ({ ...cue, id: index + 1 }));
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
    await attributeLeftovers(plan, languages);
    return {
      first: sideOf(format, plan.first.cues, neutral, languages[0], headers),
      second: sideOf(format, plan.second.cues, neutral, languages[1], headers),
    };
  }
  return null;
}
