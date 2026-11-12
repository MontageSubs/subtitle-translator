import type { ByteRange, RawBlock } from "./clusterScan";
import type { MatroskaLayout } from "./layoutProbe";

export type ScanRequest =
  | { kind: "probe"; file: Blob; desiredRanges: number }
  | { kind: "scan"; taskId: number; file: Blob; range: ByteRange; wantedTracks: number[]; nanosecondsPerTick: number };

export type ScanReply =
  | { kind: "probed"; layout: MatroskaLayout | null; ranges: ByteRange[] }
  | { kind: "progress"; taskId: number; scannedBytes: number }
  | { kind: "scanned"; taskId: number; blocks: [number, RawBlock[]][]; endOffset: number }
  | { kind: "failed"; message: string };

export const SCAN_WINDOW_BYTES = 4 * 1024 * 1024;
export const PROGRESS_INTERVAL_MS = 120;
