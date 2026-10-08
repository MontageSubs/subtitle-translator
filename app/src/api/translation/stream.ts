import { assertConfigured } from "../../config/config";
import { WorkerRequestError, abortError } from "./errors";
import { failureFromResponse, postText, startDeadline } from "./transport";
import type { TranslatedCue } from "../../lib/subtitle/types";
import type { LogHandler, ProgressHandler, StreamEvent, TranslateJobResponse, WorkerSessionPayload } from "./types";

export interface StreamHandlers {
  onLog?: LogHandler;
  onProgress?: ProgressHandler;
  onSession(payload: WorkerSessionPayload): void;
}

function carriesSession(event: Partial<WorkerSessionPayload>): event is WorkerSessionPayload {
  return Boolean(event.token && event.challengeKey);
}

class StreamCollector {
  readonly cues = new Map<number, TranslatedCue>();
  retryToken: string | undefined;
  result: TranslateJobResponse | null = null;

  constructor(wireCues: Pick<TranslatedCue, "id" | "start_ms" | "end_ms" | "text">[]) {
    wireCues.forEach(({ id, start_ms, end_ms, text }) => this.cues.set(id, { id, start_ms, end_ms, text, translation: null }));
  }

  snapshot(): TranslatedCue[] {
    return Array.from(this.cues.values());
  }

  partial(): Partial<TranslateJobResponse> {
    return {
      cues: this.snapshot(),
      retry_token: this.retryToken,
      missing_count: 0,
      missing_cues: [],
      approx_splits: [],
      quality_warnings: [],
    };
  }

  mergeChunk(deltaCues: TranslatedCue[]): void {
    for (const delta of deltaCues) {
      const existing = this.cues.get(delta.id);
      if (!existing) {
        this.cues.set(delta.id, delta);
        continue;
      }
      existing.translation = delta.translation;
      if (delta.is_music !== undefined) existing.is_music = delta.is_music;
    }
  }
}

function handleEvent(event: StreamEvent, collector: StreamCollector, handlers: StreamHandlers): void {
  switch (event.type) {
    case "init":
      if (carriesSession(event)) handlers.onSession(event);
      if (event.retry_token) collector.retryToken = event.retry_token;
      return;
    case "log":
      handlers.onLog?.(event.message);
      return;
    case "result_chunk":
      if (Array.isArray(event.data?.cues)) collector.mergeChunk(event.data.cues);
      handlers.onProgress?.({
        success: true,
        resolved_source_lang: event.data?.resolved_source_lang || "",
        cues: collector.snapshot(),
        approx_splits: [],
        missing_count: 0,
        missing_cues: [],
        quality_warnings: [],
      });
      return;
    case "error": {
      const triggerTurnstile = Boolean(event.trigger_turnstile) || event.message === "verification_required" || event.error === "rate_limited";
      throw new WorkerRequestError(event.fatal ? "Translation blocked by provider" : event.message || "translate job failed", {
        retryable: !event.fatal,
        triggerTurnstile,
        fatal: Boolean(event.fatal),
        code: event.error,
        partialResult: collector.partial(),
      });
    }
    case "result": {
      const { type, token, challengeKey, nonce, recipe, ...job } = event;
      if (carriesSession(event)) handlers.onSession(event);
      collector.result = {
        ...job,
        approx_splits: job.approx_splits ?? [],
        quality_warnings: job.quality_warnings ?? [],
        retry_token: job.retry_token || collector.retryToken,
        cues: collector.snapshot(),
      };
    }
  }
}

async function consume(response: Response, collector: StreamCollector, handlers: StreamHandlers): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flushLines = (final: boolean) => {
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) handleEvent(JSON.parse(line) as StreamEvent, collector, handlers);
    }
    if (final && buffer.trim()) handleEvent(JSON.parse(buffer) as StreamEvent, collector, handlers);
  };

  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += decoder.decode(chunk.value, { stream: true });
    flushLines(false);
  }
  buffer += decoder.decode();
  flushLines(true);
}

function interruption(error: unknown, collector: StreamCollector, timedOut: boolean, signal?: AbortSignal): Error {
  if (signal?.aborted) return abortError();
  if (error instanceof WorkerRequestError) return error;
  const partialResult = collector.partial();
  if (timedOut) return new WorkerRequestError("Request timed out", { code: "timeout", partialResult });
  const message = error instanceof Error && error.message ? error.message : "Network error during stream";
  return new WorkerRequestError(message, { retryable: true, code: "network_error", partialResult });
}

export async function postStream(
  path: string,
  body: unknown,
  wireCues: Pick<TranslatedCue, "id" | "start_ms" | "end_ms" | "text">[],
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<TranslateJobResponse> {
  assertConfigured();
  const deadline = startDeadline(signal);
  const collector = new StreamCollector(wireCues);
  try {
    const response = await postText(path, body, deadline, signal);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw failureFromResponse(response, payload, (code, status) => code || `worker responded ${status}`);
    }
    try {
      await consume(response, collector, handlers);
    } catch (error) {
      throw interruption(error, collector, deadline.timedOut(), signal);
    }
    if (collector.result) return collector.result;
    if (signal?.aborted) throw abortError();
    const partialResult = collector.partial();
    if (deadline.timedOut()) throw new WorkerRequestError("Request timed out", { code: "timeout", partialResult });
    throw new WorkerRequestError("worker stream ended without a result", { retryable: true, code: "network_error", partialResult });
  } finally {
    deadline.release();
  }
}
