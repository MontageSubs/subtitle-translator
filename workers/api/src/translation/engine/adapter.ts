import type { TermMatch, Unit } from "../../subtitle/types";
import type { TargetRules } from "../../subtitle/languages/types";
import type { UnitTranslations } from "./input";
import type { EngineSession } from "./session";

export interface Route {
  source: string;
  target: string;
  detect: boolean;
}

export interface PackedTransport {
  readonly splitsOnFailure: boolean;
  send(payloads: string[], route: Route, signal: AbortSignal, onDetected?: (lang: string) => void): Promise<(string | null)[] | null>;
}

export interface Dialect {
  readonly id: string;
  readonly autoLang: string;
  readonly poolSize: number;
  readonly spacedCueJoin: boolean;
  readonly transport: PackedTransport;
  normalizeLang(code: string): string;
  encode(text: string, matches: readonly TermMatch[]): string;
  wrap(body: string): string;
  restore(flat: string): string;
  applyTerms(translated: string, original: string, matches: readonly TermMatch[], rules: TargetRules): string;
  polish(text: string): string;
}

export interface InitialPass {
  (session: EngineSession, units: Unit[], context: string | undefined, publish: (chunk: UnitTranslations) => void): Promise<UnitTranslations>;
}

export interface Adapter {
  readonly dialect: Dialect;
  readonly initialPass: InitialPass;
}

