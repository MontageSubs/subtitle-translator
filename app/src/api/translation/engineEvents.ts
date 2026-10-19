import { describeCueSet, formatCueRuns } from "../../utils/cueRuns";

export type EngineEvent =
  | { e: "plan"; provider: string; batches: number[][] }
  | { e: "cap"; kept: number; total: number }
  | { e: "skip"; cues: number[] }
  | { e: "batches"; total: number; items: { index: number; attempts?: number; missing: number[] }[] }
  | { e: "fail"; scope: "batch" | "chunk" | "context" | "glossary"; code: string; count: number; at: number[] }
  | { e: "retry"; stage: "missing" | "script" | "window" | "isolated" | "leak"; cues: number[]; unresolved: number[]; rounds?: number }
  | { e: "repair"; kind: "glossary" | "style" | "latin"; cues: number[]; words: number }
  | { e: "budget" }
  | { e: "merge"; total: number; missing: number[]; splits: number[] };

type Level = "INFO" | "WARN" | "ERROR";

const ORDER: Record<EngineEvent["e"], number> = { plan: 0, cap: 1, skip: 2, batches: 3, fail: 4, retry: 5, repair: 6, budget: 7, merge: 8 };

const REPAIR_LABELS = { glossary: "glossary-only fill", style: "style tags stripped", latin: "latin leak repair" } as const;

const entry = (level: Level, scope: string, text: string): string => `00:00:00.000 [${level}] [${scope}] ${text}`;

function formatEvent(event: EngineEvent, backend: string | undefined): string {
  switch (event.e) {
    case "plan": {
      const total = new Set(event.batches.flat()).size;
      const ranges = event.batches.map((cues, i) => `${i + 1}:${formatCueRuns(cues)}`).join(" ");
      return entry("INFO", "Engine", `plan engine=${event.provider}${backend ? ` backend=v${backend}` : ""} cues=${total} batches=${event.batches.length} ranges ${ranges}`);
    }
    case "cap":
      return entry("INFO", "Engine", `batches capped kept=${event.kept}/${event.total}`);
    case "skip":
      return entry("INFO", "Engine", `skipped oversized cues=${describeCueSet(event.cues)}`);
    case "batches": {
      const details = event.items
        .map((item) => `${item.index}/${event.total}${item.attempts ? ` attempts=${item.attempts}` : ""} ${item.missing.length ? `missing cue=${describeCueSet(item.missing)}` : "complete"}`)
        .join("; ");
      return entry("INFO", "Engine", `batch issues ${details}`);
    }
    case "fail": {
      const at = event.at.length ? ` batches=${formatCueRuns(event.at)}` : "";
      return entry("INFO", "Engine", `${event.scope} failed error=${event.code} count=${event.count}${at}`);
    }
    case "retry": {
      const lost = new Set(event.unresolved);
      const fixed = event.cues.filter((id) => !lost.has(id));
      const rounds = event.rounds ? ` rounds=${event.rounds}` : "";
      return entry("INFO", "Retry", `${event.stage} cues=${describeCueSet(event.cues)} fixed=${describeCueSet(fixed)} unresolved=${describeCueSet(event.unresolved)}${rounds}`);
    }
    case "repair": {
      const words = event.words ? ` words=${event.words}` : "";
      return entry("INFO", "Pipeline", `${REPAIR_LABELS[event.kind]} cues=${describeCueSet(event.cues)}${words}`);
    }
    case "budget":
      return entry("INFO", "Engine", "work limit reached, stopping early");
    case "merge": {
      const lost = event.missing.length ? ` missing cue=${describeCueSet(event.missing)}` : "";
      return entry(lost ? "WARN" : "INFO", "Pipeline", `merge translated=${event.total - event.missing.length}/${event.total} splits=${describeCueSet(event.splits)}${lost}`);
    }
  }
}

export const formatEngineEvents = (events: readonly EngineEvent[], backend?: string): string[] =>
  [...events].sort((a, b) => ORDER[a.e] - ORDER[b.e]).map((event) => formatEvent(event, backend));
