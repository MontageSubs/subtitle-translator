import type { EngineLog } from "../../logging/engineLog";
import type { Unit } from "../../subtitle/types";
import { countCues, unitsCues } from "./cueLabels";

export interface BatchReport {
  readonly label: string;
  readonly units: () => Unit[];
  readonly received: { has(unitId: number): boolean };
  readonly attempts?: number;
}

export const logBatchOutcome = (log: EngineLog, { label, units, received, attempts }: BatchReport): void =>
  log(() => {
    const members = units();
    const missing = members.filter((unit) => !received.has(unit.id));
    const total = countCues(members);
    const lost = missing.length ? countCues(missing) : 0;
    return `dispatch batch ${label} cues=${unitsCues(members)} translated=${total - lost}/${total}${attempts ? ` attempts=${attempts}` : ""}${lost ? ` missing cue=${unitsCues(missing)}` : ""}`;
  });
