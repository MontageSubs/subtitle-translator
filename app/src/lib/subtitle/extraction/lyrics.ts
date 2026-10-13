import { Cue, TranslatedCue } from "../types";
import { isMusicText } from "../common/charClass";
import { STYLE_TAG_ALT } from "../common/markup";

const DIALOGUE_DASH_PATTERN = new RegExp(`(?:^|(?<=\\s))${STYLE_TAG_ALT}*-(?!-)${STYLE_TAG_ALT}*\\s?`, "gi");
const FULL_WRAP_PATTERN = /^<([ibu])>([\s\S]*)<\/\1>$/i;
const LEADING_DASH_PATTERN = /^[-\s]+/;
const SPACED_DASH_PATTERN = /(?:^|\s)-\s/;

type Anchor = number | null;

interface MixedPlan {
  text: string;
  segments: string[];
  isLyric: boolean[];
  dash: string;
}

export interface LyricMask {
  retained: Cue[];
  restore(cues: TranslatedCue[]): TranslatedCue[];
}

function splitDialogue(text: string): string[] {
  const matches = text.includes("-") ? [...text.matchAll(DIALOGUE_DASH_PATTERN)] : [];
  if (!matches.length) return [text];
  const segments = matches.map((match, i) => text.slice(match.index! + match[0].length, matches[i + 1]?.index ?? text.length).trim());
  if (matches[0]!.index! > 0) segments.unshift(text.slice(0, matches[0]!.index!).trim());
  const filtered = segments.filter(Boolean);
  return filtered.length ? filtered : [text];
}

const joinSegments = (segments: string[], dash: string): string => segments.map((segment) => `${dash}${segment}`).join(" ");

function planMixed(text: string): MixedPlan | "lyric" | null {
  const wrapped = FULL_WRAP_PATTERN.exec(text);
  const segments = splitDialogue(wrapped ? wrapped[2]! : text);
  const isLyric = segments.map(isMusicText);
  if (isLyric.every(Boolean)) return "lyric";
  if (wrapped || !isLyric.some(Boolean)) return null;
  return { text, segments, isLyric, dash: SPACED_DASH_PATTERN.test(text) ? "- " : "-" };
}

const dialogueOf = ({ segments, isLyric }: MixedPlan): string[] => segments.filter((_, i) => !isLyric[i]);

function composeMixed(plan: MixedPlan, translation: string): string {
  const slots = dialogueOf(plan).length;
  const pieces = splitDialogue(translation);
  const dialogue = pieces.length === slots ? pieces : [translation.replace(LEADING_DASH_PATTERN, "")];
  let next = 0;
  return joinSegments(plan.segments.map((segment, i) => (plan.isLyric[i] ? segment : dialogue[next++] ?? "")).filter(Boolean), plan.dash);
}

const verbatimCue = ({ id, start_ms, end_ms, text }: Cue): TranslatedCue => ({ id, start_ms, end_ms, text, translation: null, is_music: true, verbatim: true });

export function maskLyrics(cues: Cue[], enabled: boolean): LyricMask {
  if (!enabled) return { retained: cues, restore: (translated) => translated };
  const retained: Cue[] = [];
  const mixedById = new Map<number, MixedPlan>();
  const lyricsAfter = new Map<Anchor, TranslatedCue[]>();
  let anchor: Anchor = null;
  for (const cue of cues) {
    const plan = planMixed(cue.text);
    if (plan === "lyric") {
      lyricsAfter.set(anchor, [...(lyricsAfter.get(anchor) ?? []), verbatimCue(cue)]);
      continue;
    }
    if (plan) {
      mixedById.set(cue.id, plan);
      const dialogue = dialogueOf(plan);
      retained.push({ ...cue, text: dialogue.length > 1 ? joinSegments(dialogue, "- ") : dialogue[0]! });
    } else {
      retained.push(cue);
    }
    anchor = cue.id;
  }
  const rejoin = (cue: TranslatedCue): TranslatedCue => {
    const plan = mixedById.get(cue.id);
    return plan ? { ...cue, text: plan.text, translation: cue.translation && composeMixed(plan, cue.translation) } : cue;
  };
  return {
    retained,
    restore: (translated) => [
      ...(lyricsAfter.get(null) ?? []),
      ...translated.flatMap((cue) => [rejoin(cue), ...(lyricsAfter.get(cue.id) ?? [])]),
    ],
  };
}
