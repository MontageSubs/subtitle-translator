import { Cue } from "../../../utils/types";
import { MUSIC_NOTE_PATTERN, MUSIC_NOTE_GLOBAL_PATTERN, WHITESPACE_PATTERN } from "./patterns";
import { stripSpeakerTags } from "./speakerTags";

const BRACKET_INNER = "\\[\\]\\(\\)\\{\\}\uff08\uff09\u3010\u3011";
const SDH_BRACKET_PATTERN = new RegExp(
  `\\[[^${BRACKET_INNER}]*\\]|\\([^${BRACKET_INNER}]*\\)|\\{[^${BRACKET_INNER}]*\\}|\uff08[^${BRACKET_INNER}]*\uff09|\u3010[^${BRACKET_INNER}]*\u3011`,
  "g"
);

interface SdhPolicy {
  stripSpeakerTags: boolean;
}

const SDH_POLICIES: Readonly<Record<string, SdhPolicy>> = {
  en: { stripSpeakerTags: true },
};

export interface SdhStripResult {
  cues: Cue[];
  stats: { dropped: number; stripped: number };
}

function stripBrackets(text: string): string {
  let current = text;
  for (let next = current.replace(SDH_BRACKET_PATTERN, ""); next !== current; next = current.replace(SDH_BRACKET_PATTERN, "")) {
    current = next;
  }
  const cleaned = current.replace(WHITESPACE_PATTERN, " ").trim();
  if (cleaned || !MUSIC_NOTE_PATTERN.test(text)) return cleaned;
  return (text.match(MUSIC_NOTE_GLOBAL_PATTERN) ?? []).join(" ");
}

function stripCueSdh(text: string, policy: SdhPolicy): string {
  const lines = text.split("\n").filter(Boolean);
  const hasMusic = lines.some((line) => MUSIC_NOTE_PATTERN.test(line));
  const prepared = policy.stripSpeakerTags && lines.length && !hasMusic ? stripSpeakerTags(lines) : lines;
  return prepared.map(stripBrackets).filter(Boolean).join("\n");
}

function policyFor(sourceLang: string): SdhPolicy | undefined {
  return SDH_POLICIES[sourceLang.split("-")[0].toLowerCase()];
}

export function applySdhStripping(cues: Cue[], sourceLang: string, enabled: boolean): SdhStripResult {
  const policy = enabled ? policyFor(sourceLang) : undefined;
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
