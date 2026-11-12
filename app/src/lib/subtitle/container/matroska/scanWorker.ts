import { RawBlock, scanRange } from "./clusterScan";
import { FileWindow } from "./fileWindow";
import { probeLayout } from "./layoutProbe";
import { planRanges } from "./rangePlan";
import { PROGRESS_INTERVAL_MS, SCAN_WINDOW_BYTES, ScanReply, ScanRequest } from "./scanProtocol";

const reply = (message: ScanReply, transfer: Transferable[] = []): void => self.postMessage(message, { transfer });

function transferablesOf(blocks: Map<number, RawBlock[]>): Transferable[] {
  return [...blocks.values()].flatMap((list) => list.map((block) => block.data.buffer));
}

async function handleProbe(file: Blob, desiredRanges: number): Promise<void> {
  const window = new FileWindow(file, SCAN_WINDOW_BYTES);
  const layout = await probeLayout(window);
  reply({ kind: "probed", layout, ranges: layout ? await planRanges(window, layout, desiredRanges) : [] });
}

async function handleScan({ taskId, file, range, wantedTracks, nanosecondsPerTick }: Extract<ScanRequest, { kind: "scan" }>): Promise<void> {
  let lastReportAt = 0;
  const { blocks, endOffset } = await scanRange({
    window: new FileWindow(file, SCAN_WINDOW_BYTES),
    wantedTracks: new Set(wantedTracks),
    nanosecondsPerTick,
    onAdvance: (scannedBytes) => {
      const now = performance.now();
      if (now - lastReportAt < PROGRESS_INTERVAL_MS) return;
      lastReportAt = now;
      reply({ kind: "progress", taskId, scannedBytes });
    },
  }, range);
  reply({ kind: "scanned", taskId, blocks: [...blocks], endOffset }, transferablesOf(blocks));
}

self.onmessage = async (event: MessageEvent<ScanRequest>): Promise<void> => {
  try {
    if (event.data.kind === "probe") await handleProbe(event.data.file, event.data.desiredRanges);
    else await handleScan(event.data);
  } catch (error) {
    reply({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
  }
};
