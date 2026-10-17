import type { HistoryJob } from "./history";

export const HISTORY_SCHEMA = 1;

export const schemaOf = (raw: any): number => (Number.isInteger(raw?.schema) ? raw.schema : 1);

export function isReadableJob(raw: any): raw is HistoryJob {
  return (
    typeof raw?.id === "string" &&
    typeof raw.createdAt === "number" &&
    Array.isArray(raw.subtitles) &&
    raw.subtitles.every((subtitle: any) => Array.isArray(subtitle?.cues))
  );
}
