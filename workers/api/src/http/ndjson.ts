import { describeError } from "../logging/fault";
import { logRequestFailure } from "../logging/requestLog";
import { leaksSecret } from "./outputGuard";
import { corsHeaders } from "./responses";
import type { RequestContext } from "./context";

export type Emit = (event: object) => Promise<void>;

const NEWLINE = 0x0a;

function encodeLine(encoder: TextEncoder, text: string): Uint8Array {
  const buffer = new Uint8Array(text.length * 3 + 1);
  const { written } = encoder.encodeInto(text, buffer);
  buffer[written] = NEWLINE;
  return buffer.slice(0, written + 1);
}

export function streamNdjson(rc: RequestContext, produce: (emit: Emit) => Promise<void>): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit: Emit = async (event) => {
    const serialized = JSON.stringify(event);
    const safe = leaksSecret(serialized, rc.env) ? JSON.stringify({ type: "error", message: "output_blocked", fatal: true }) : serialized;
    await writer.write(encodeLine(encoder, safe));
  };

  rc.ctx.waitUntil(
    (async () => {
      try {
        await produce(emit);
      } catch (error) {
        logRequestFailure(rc, `stream aborted: ${describeError(error)}`);
        await emit({ type: "error", message: "internal_error" }).catch(() => undefined);
      } finally {
        await writer.close().catch(() => undefined);
      }
    })()
  );

  return new Response(readable, { status: 200, headers: { "Content-Type": "application/x-ndjson", ...corsHeaders(rc.origin) } });
}
