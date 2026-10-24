import type { BilingualCue, Cue } from "../subtitle/types";

export type ProtocolCue = Cue;

export interface ProtocolTranslation {
  id: number;
  translation: string;
  is_music?: true;
}

export function toProtocolTranslation({ id, translation, is_music }: BilingualCue): ProtocolTranslation {
  return is_music ? { id, translation: translation!, is_music } : { id, translation: translation! };
}

export function isValidProtocolCue(value: unknown): value is ProtocolCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as Record<string, unknown>;
  return typeof cue.id === "number" && typeof cue.start_ms === "number" && typeof cue.end_ms === "number" && typeof cue.text === "string";
}
