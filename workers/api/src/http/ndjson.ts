import { reportError } from "../telemetry/log";
import { leaksSecret } from "./outputGuard";
import { corsHeaders } from "./responses";
import type { RequestContext } from "./context";

export type Emit = (event: object) => Promise<void>;

export function streamNdjson(rc: RequestContext, produce: (emit: Emit) => Promise<void>): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit: Emit = async (event) => {
    const serialized = JSON.stringify(event);
    const safe = leaksSecret(serialized, rc.env) ? JSON.stringify({ type: "error", message: "output_blocked", fatal: true }) : serialized;
    await writer.write(encoder.encode(`${safe}\n`));
  };

  rc.ctx.waitUntil(
    (async () => {
      try {
        await produce(emit);
      } catch (error) {
        reportError("ndjsonStream error", error);
        await emit({ type: "error", message: "internal_error" }).catch(() => undefined);
      } finally {
        await writer.close().catch(() => undefined);
      }
    })()
  );

  return new Response(readable, { status: 200, headers: { "Content-Type": "application/x-ndjson", ...corsHeaders(rc.origin) } });
}
