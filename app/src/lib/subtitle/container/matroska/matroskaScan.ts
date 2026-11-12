import { ByteRange, RawBlock, scanRange } from "./clusterScan";
import { FileWindow } from "./fileWindow";
import { MatroskaLayout, probeLayout } from "./layoutProbe";
import { SCAN_WINDOW_BYTES, ScanReply, ScanRequest } from "./scanProtocol";
import type { MatroskaTrack } from "./tracks";

export interface MatroskaScan {
  tracks: MatroskaTrack[];
  blocksByTrack: Map<number, RawBlock[]>;
}

export interface MatroskaScanOptions {
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

export class MatroskaReadError extends Error {}

const MAX_SCAN_WORKERS = 4;
const RANGES_PER_WORKER = 6;

const workerCount = (): number => Math.max(1, Math.min(MAX_SCAN_WORKERS, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

const abortError = (): DOMException => new DOMException("Scan aborted", "AbortError");

function mergeBlocks(parts: Map<number, RawBlock[]>[]): Map<number, RawBlock[]> {
  const merged = new Map<number, RawBlock[]>();
  for (const part of parts) {
    for (const [track, blocks] of part) {
      const list = merged.get(track);
      if (list) list.push(...blocks);
      else merged.set(track, blocks);
    }
  }
  return merged;
}

function rangesAreContiguous(ranges: ByteRange[], endOffsets: number[], segmentEnd: number): boolean {
  return ranges.every((range, index) => (index === ranges.length - 1 ? endOffsets[index] >= segmentEnd : endOffsets[index] === range.end));
}

const wantedTrackNumbers = (layout: MatroskaLayout): number[] => layout.tracks.filter((track) => track.isText).map((track) => track.number);

async function scanInThread(file: Blob, options: MatroskaScanOptions): Promise<MatroskaScan> {
  const window = new FileWindow(file, SCAN_WINDOW_BYTES);
  const layout = await probeLayout(window);
  if (!layout) throw new MatroskaReadError("Not a readable Matroska file");
  const wanted = wantedTrackNumbers(layout);
  if (!wanted.length) return { tracks: layout.tracks, blocksByTrack: new Map() };
  const range = { start: layout.clusterStart, end: layout.segmentEnd };
  const { blocks } = await scanRange({
    window,
    wantedTracks: new Set(wanted),
    nanosecondsPerTick: layout.nanosecondsPerTick,
    onAdvance: (scannedBytes) => options.onProgress(scannedBytes / Math.max(1, range.end - range.start)),
  }, range);
  return { tracks: layout.tracks, blocksByTrack: blocks };
}

class ScanPool {
  private readonly workers: Worker[] = [];

  constructor(private readonly onFailure: (error: Error) => void) {}

  spawn(): Worker {
    const worker = new Worker(new URL("./scanWorker.ts", import.meta.url), { type: "module" });
    worker.onerror = () => this.onFailure(new MatroskaReadError("Scan worker failed"));
    this.workers.push(worker);
    return worker;
  }

  terminateAll(): void {
    this.workers.forEach((worker) => worker.terminate());
    this.workers.length = 0;
  }
}

function request<Reply extends ScanReply["kind"]>(worker: Worker, message: ScanRequest, expected: Reply, onReply?: (reply: ScanReply) => void): Promise<Extract<ScanReply, { kind: Reply }>> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ScanReply>) => {
      if (event.data.kind === expected) resolve(event.data as Extract<ScanReply, { kind: Reply }>);
      else if (event.data.kind === "failed") reject(new MatroskaReadError(event.data.message));
      else onReply?.(event.data);
    };
    worker.postMessage(message);
  });
}

interface ParallelRun {
  layout: MatroskaLayout;
  ranges: ByteRange[];
  wanted: number[];
}

async function runRanges(pool: ScanPool, file: Blob, run: ParallelRun, concurrency: number, options: MatroskaScanOptions, firstWorker: Worker): Promise<{ parts: Map<number, RawBlock[]>[]; endOffsets: number[] }> {
  const { layout, ranges, wanted } = run;
  const totalBytes = Math.max(1, ranges.reduce((sum, range) => sum + range.end - range.start, 0));
  const scanned = new Array<number>(ranges.length).fill(0);
  const parts = new Array<Map<number, RawBlock[]>>(ranges.length);
  const endOffsets = new Array<number>(ranges.length).fill(0);
  let nextRange = 0;

  async function drain(worker: Worker): Promise<void> {
    for (let index = nextRange++; index < ranges.length; index = nextRange++) {
      const reply = await request(worker, {
        kind: "scan", taskId: index, file, range: ranges[index], wantedTracks: wanted, nanosecondsPerTick: layout.nanosecondsPerTick,
      }, "scanned", (message) => {
        if (message.kind !== "progress") return;
        scanned[message.taskId] = message.scannedBytes;
        options.onProgress(scanned.reduce((sum, bytes) => sum + bytes, 0) / totalBytes);
      });
      scanned[index] = ranges[index].end - ranges[index].start;
      parts[index] = new Map(reply.blocks);
      endOffsets[index] = reply.endOffset;
      options.onProgress(scanned.reduce((sum, bytes) => sum + bytes, 0) / totalBytes);
    }
  }

  const workers = [firstWorker, ...Array.from({ length: Math.max(0, Math.min(concurrency, ranges.length) - 1) }, () => pool.spawn())];
  await Promise.all(workers.map(drain));
  return { parts, endOffsets };
}

async function scanWithWorkers(file: Blob, options: MatroskaScanOptions): Promise<MatroskaScan> {
  let fail: (error: Error) => void = () => undefined;
  const failure = new Promise<never>((_, reject) => { fail = reject; });
  const pool = new ScanPool((error) => fail(error));
  const onAbort = (): void => fail(abortError());
  options.signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (options.signal.aborted) throw abortError();
    const concurrency = workerCount();
    const probeWorker = pool.spawn();
    const work = (async (): Promise<MatroskaScan> => {
      const probed = await request(probeWorker, { kind: "probe", file, desiredRanges: concurrency * RANGES_PER_WORKER }, "probed");
      const { layout } = probed;
      if (!layout) throw new MatroskaReadError("Not a readable Matroska file");
      const wanted = wantedTrackNumbers(layout);
      if (!wanted.length) return { tracks: layout.tracks, blocksByTrack: new Map() };
      let ranges = probed.ranges;
      let outcome = await runRanges(pool, file, { layout, ranges, wanted }, concurrency, options, probeWorker);
      if (!rangesAreContiguous(ranges, outcome.endOffsets, layout.segmentEnd)) {
        ranges = [{ start: layout.clusterStart, end: layout.segmentEnd }];
        outcome = await runRanges(pool, file, { layout, ranges, wanted }, 1, options, probeWorker);
      }
      return { tracks: layout.tracks, blocksByTrack: mergeBlocks(outcome.parts) };
    })();
    return await Promise.race([work, failure]);
  } finally {
    options.signal.removeEventListener("abort", onAbort);
    pool.terminateAll();
  }
}

export function scanMatroska(file: Blob, options: MatroskaScanOptions): Promise<MatroskaScan> {
  return typeof Worker === "undefined" ? scanInThread(file, options) : scanWithWorkers(file, options);
}
