import type { NerEntity } from "./decode";

export type NerFailure = "memory" | "corrupt" | "load" | "aborted";

export interface NerFileKeys {
  cacheName: string;
  model: string;
  config: string;
  vocabulary: string;
}

export type NerRequest =
  | { type: "initialize"; id: number; keys: NerFileKeys }
  | { type: "recognize"; id: number; chunks: string[] }
  | { type: "cancel"; id: number }
  | { type: "dispose" };

export type NerResponse =
  | { type: "ready"; id: number }
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "result"; id: number; entities: NerEntity[][] }
  | { type: "failure"; id: number; failure: NerFailure };
