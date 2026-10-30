import type { NerEntity } from "./decode";
import type { NerBackend } from "./inference";

export type NerFailure = "memory" | "corrupt" | "incompatible" | "load" | "aborted";

export interface NerFileKeys {
  adapter: string;
  providers: readonly string[];
  cacheName: string;
  files: Readonly<Record<string, string>>;
}

export type NerRequest =
  | { type: "initialize"; id: number; keys: NerFileKeys }
  | { type: "recognize"; id: number; units: string[] }
  | { type: "cancel"; id: number }
  | { type: "dispose" };

export type NerResponse =
  | { type: "ready"; id: number; backend: NerBackend }
  | { type: "result"; id: number; entities: NerEntity[][] }
  | { type: "failure"; id: number; failure: NerFailure };
