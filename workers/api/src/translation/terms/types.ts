import type { UpstreamContext } from "../types";

export interface TermInput {
  id: number;
  text: string;
}

export interface TermTranslation {
  id: number;
  translation: string;
}

export interface TermOutcome {
  results: TermTranslation[];
  failed: number[];
}

export interface TermTransport {
  readonly maxItems: number;
  readonly splitsOnFailure: boolean;
  send(texts: string[], signal: AbortSignal): Promise<(string | null)[] | null>;
}

export interface TermJob extends UpstreamContext {
  sourceLang: string;
  targetLang: string;
}
