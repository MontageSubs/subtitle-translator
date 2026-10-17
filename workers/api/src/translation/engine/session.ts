import type { EngineLog } from "../../logging/engineLog";
import { isDebugEnabled } from "../../logging/level";
import { targetRulesFor } from "../../subtitle/languages/registry";
import type { TargetRules } from "../../subtitle/languages/types";
import type { PunctuationOptions } from "../../subtitle/merge";
import type { Unit } from "../../subtitle/types";
import type { EngineInput, ProviderJob } from "../types";
import type { Dialect, Route } from "./adapter";
import { SUBREQUEST_LIMIT, SubrequestBudget } from "./budget";
import { deadlineSignal } from "./concurrency";
import { buildCueIndex, type CueIndex } from "./cueChunks";

export class SourceLangTracker {
  private detected: string | null = null;

  constructor(private readonly requested: string, private readonly autoLang: string, private readonly normalize: (code: string) => string) {}

  get current(): string {
    return this.detected ?? this.requested;
  }

  get isAuto(): boolean {
    return this.current === this.autoLang;
  }

  note(lang: string | null | undefined): void {
    if (!this.detected && lang && this.requested === this.autoLang) this.detected = this.normalize(lang);
  }
}

export interface EngineSession {
  readonly dialect: Dialect;
  readonly job: ProviderJob;
  readonly targetLang: string;
  readonly targetRules: TargetRules;
  readonly source: SourceLangTracker;
  readonly budget: SubrequestBudget;
  readonly requestChars: number;
  readonly units: Unit[];
  readonly chapterOf: Map<number, number>;
  readonly unitById: Map<number, Unit>;
  readonly cueIndex: CueIndex;
  readonly log: EngineLog;
  readonly punctuation?: PunctuationOptions;
}

export function createSession(dialect: Dialect, input: EngineInput, job: ProviderJob, requestChars: number): EngineSession {
  const log = job.onLog;
  let cueIndex: CueIndex | undefined;
  return {
    dialect,
    job,
    targetLang: dialect.normalizeLang(job.targetLang),
    targetRules: targetRulesFor(job.targetLang),
    source: new SourceLangTracker(dialect.normalizeLang(job.sourceLang), dialect.autoLang, (code) => dialect.normalizeLang(code)),
    budget: new SubrequestBudget(SUBREQUEST_LIMIT, () => log("Subrequest physical breaker triggered, gracefully terminating to protect worker invocation limit.")),
    requestChars,
    units: input.units,
    chapterOf: new Map(input.chapters.flatMap((chapter) => chapter.unit_ids.map((id) => [id, chapter.id] as const))),
    unitById: new Map(input.units.map((unit) => [unit.id, unit])),
    get cueIndex() {
      cueIndex ??= buildCueIndex(input.units);
      return cueIndex;
    },
    log,
    punctuation: job.punctuation,
  };
}

export function routeFor(session: EngineSession, auto: boolean = false): Route {
  return auto
    ? { source: session.dialect.autoLang, target: session.targetLang, detect: false }
    : { source: session.source.current, target: session.targetLang, detect: true };
}

export async function sendGuarded(
  session: EngineSession, payloads: string[], route: Route, signal: AbortSignal = deadlineSignal(session.job.startedAt)
): Promise<(string | null)[] | null> {
  session.budget.consume();
  if (isDebugEnabled(2)) session.log(() => `upstream request ${session.budget.consumed}/${SUBREQUEST_LIMIT}: ${payloads.length} payload(s), ${payloads.reduce((sum, payload) => sum + payload.length, 0)} chars`, 2);
  return session.dialect.transport.send(payloads, route, signal, route.detect ? (lang) => session.source.note(lang) : undefined);
}
