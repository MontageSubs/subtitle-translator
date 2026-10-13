import type { Cue } from "../subtitle/types";

export type ProtocolCue = Cue;

export function isValidProtocolCue(value: unknown): value is ProtocolCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return typeof cue.id === "number" && typeof cue.start_ms === "number" && typeof cue.end_ms === "number" && typeof cue.text === "string";
}
