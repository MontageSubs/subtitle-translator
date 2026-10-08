import { Cue } from "../types";
import { sourceRulesFor } from "../language/resolve";
import { SdhRules } from "../language/shared/types";
import { stripSpeakerTags } from "./speakerTags";

const MUSIC_NOTE_CHARS = "\u2669\u266a\u266b\u266c";
const MUSIC_NOTE_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`);
const MUSIC_NOTE_GLOBAL_PATTERN = new RegExp(`[${MUSIC_NOTE_CHARS}]`, "g");
const WHITESPACE_PATTERN = /\s+/g;
const BRACKET_INNER = "\\[\\]\\(\\)\\{\\}\uff08\uff09\u3010\u3011";
const SDH_BRACKET_PATTERN = new RegExp(
  `\\[[^${BRACKET_INNER}]*\\]|\\([^${BRACKET_INNER}]*\\)|\\{[^${BRACKET_INNER}]*\\}|\uff08[^${BRACKET_INNER}]*\uff09|\u3010[^${BRACKET_INNER}]*\u3011`,
  "g"
);

export interface SdhStripResult {
  cues: Cue[];
  stats: { dropped: number; stripped: number };
}

function stripSdh(text: string): string {
  let current = text;
  for (let next = current.replace(SDH_BRACKET_PATTERN, ""); next !== current; next = current.replace(SDH_BRACKET_PATTERN, "")) {
    current = next;
  }
  const cleaned = current.replace(WHITESPACE_PATTERN, " ").trim();
  if (cleaned || !MUSIC_NOTE_PATTERN.test(text)) return cleaned;
  return (text.match(MUSIC_NOTE_GLOBAL_PATTERN) ?? []).join(" ");
}

function stripCueSdh(text: string, policy: SdhRules): string {
  const lines = text.split("\n").filter(Boolean);
  const hasMusic = lines.some((line) => MUSIC_NOTE_PATTERN.test(line));
  const prepared = policy.stripsSpeakerTags && lines.length && !hasMusic ? stripSpeakerTags(lines) : lines;
  return prepared.map(stripSdh).filter(Boolean).join("\n");
}

export function applySdhStripping(cues: Cue[], sourceLang: string, enabled: boolean): SdhStripResult {
  const policy = enabled && sourceLang ? sourceRulesFor(sourceLang).sdh : null;
  const stats = { dropped: 0, stripped: 0 };
  if (!policy) return { cues, stats };

  const result: Cue[] = [];
  for (const cue of cues) {
    const stripped = stripCueSdh(cue.text, policy);
    if (stripped !== cue.text) stats[stripped ? "stripped" : "dropped"] += 1;
    if (stripped) result.push({ ...cue, text: stripped });
  }
  return { cues: result, stats };
}
