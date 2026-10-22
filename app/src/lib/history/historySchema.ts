import { isLegacyJob, upgradeLegacyJob } from "./historyMigration";
import type { HistoryJob, HistoryJobBody, HistoryJobHead, HistorySummary } from "./historyTypes";

export const HISTORY_SCHEMA = 2;

export const schemaOf = (raw: any): number => (Number.isInteger(raw?.schema) ? raw.schema : 1);

const hasJobShape = (raw: any): boolean =>
  typeof raw?.id === "string" &&
  typeof raw.createdAt === "number" &&
  Array.isArray(raw.subtitles) &&
  raw.subtitles.every((subtitle: any) => Array.isArray(subtitle?.cues));

export function readJob(raw: any): HistoryJob | undefined {
  if (!hasJobShape(raw) || schemaOf(raw) > HISTORY_SCHEMA) return undefined;
  if (isLegacyJob(raw)) return upgradeLegacyJob(raw);
  const { schema, ...job } = raw;
  return job;
}

const HEAD_FIELDS = ["id", "historyId", "engine", "provider", "title", "sourceLang", "targetLang", "glossary", "contextText", "caseSensitiveTerms", "incomplete", "createdAt", "updatedAt"] as const;

const isHeadField = (key: string): boolean => (HEAD_FIELDS as readonly string[]).includes(key);

export const touchesBody = (partial: object): boolean => Object.keys(partial).some((key) => !isHeadField(key));

export function splitJob(job: HistoryJob): { head: HistorySummary; body: HistoryJobBody } {
  const body = Object.fromEntries(Object.entries(job).filter(([key]) => !isHeadField(key))) as unknown as HistoryJobBody;
  const head = {
    ...(Object.fromEntries(HEAD_FIELDS.map((field) => [field, job[field]])) as unknown as HistoryJobHead),
    cueCount: body.subtitles.reduce((sum, subtitle) => sum + subtitle.cues.length, 0),
    files: body.subtitles.map((subtitle) => ({ id: subtitle.id, name: subtitle.filename, incomplete: subtitle.incomplete })),
  };
  return { head, body };
}

export function joinJob(head: HistorySummary, body: HistoryJobBody): HistoryJob {
  const { cueCount, files, ...headFields } = head;
  return { ...headFields, ...body };
}
