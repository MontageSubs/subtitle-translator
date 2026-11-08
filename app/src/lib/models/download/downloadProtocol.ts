export type DownloadCommand =
  | { kind: "fetch"; request: number; job: string; file: string; urls: readonly string[] }
  | { kind: "abort"; request: number }
  | { kind: "received"; request: number; job: string }
  | { kind: "discard"; job: string };

export type DownloadEvent =
  | { kind: "bytes"; request: number; delta: number }
  | { kind: "done"; request: number; blob: Blob }
  | { kind: "received"; request: number; value: number }
  | { kind: "failed"; request: number; aborted: boolean; failure: "network" | "unavailable"; detail: string | null };
