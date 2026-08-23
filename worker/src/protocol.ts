export interface ProtocolCue {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface TranslateStreamRequest {
  source: string;
  target: string;
  glossary: Record<string, string>;
  cues: ProtocolCue[];
  sceneChangeSeconds?: number;
}

export type TranslateStreamEvent =
  | { type: "cue"; id: number; translation: string | null }
  | { type: "done"; success: boolean; resolved_source_lang: string; failed_ids: number[] };

export function isDoneEvent(event: TranslateStreamEvent): event is Extract<TranslateStreamEvent, { type: "done" }> {
  return event.type === "done";
}

const CUE_TEXT_SEPARATOR = "\u0000";
const COMPONENT_SEPARATOR = "\u0002";
const GLOSSARY_KV_SEPARATOR = "\u0000";
const GLOSSARY_ENTRY_SEPARATOR = "\u0001";

export type Operation = "translate-job";

export function canonicalizeCues(cues: { text: string }[]): string {
  return cues.map((cue) => cue.text).join(CUE_TEXT_SEPARATOR);
}

function canonicalizeGlossary(glossary: Record<string, string>): string {
  return Object.entries(glossary)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}${GLOSSARY_KV_SEPARATOR}${v}`)
    .join(GLOSSARY_ENTRY_SEPARATOR);
}

export function computeRequestDigest(
  operation: Operation, source: string, target: string, glossary: Record<string, string>, cues: { text: string }[]
): string {
  return [operation, source, target, canonicalizeGlossary(glossary), canonicalizeCues(cues)].join(COMPONENT_SEPARATOR);
}

export function isValidProtocolCue(value: unknown): value is ProtocolCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return (
    typeof cue.id === "number" &&
    typeof cue.start_ms === "number" &&
    typeof cue.end_ms === "number" &&
    typeof cue.text === "string"
  );
}
