import type { Adapter } from "../engine/adapter";
import type { TermJob, TermTransport } from "./types";

const MAX_ITEMS_PER_REQUEST = 100;

export function dialectTermTransport({ dialect }: Adapter, job: TermJob): TermTransport {
  const route = { source: dialect.normalizeLang(job.sourceLang), target: dialect.normalizeLang(job.targetLang), detect: false };
  return {
    maxItems: MAX_ITEMS_PER_REQUEST,
    splitsOnFailure: dialect.transport.splitsOnFailure,
    async send(texts, signal) {
      const payloads = texts.map((text) => dialect.wrap(dialect.encode(text, [])));
      const flats = await dialect.transport.send(payloads, route, signal);
      return flats && flats.map((flat) => (flat === null ? null : dialect.polish(dialect.restore(flat))));
    },
  };
}
