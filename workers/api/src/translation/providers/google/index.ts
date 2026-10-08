import type { Env } from "../../../config/env";
import { runEngine } from "../../engine/run";
import type { ProviderJob, TranslationProvider } from "../../types";
import { createGoogleAdapter } from "./dialect";
import type { GoogleHtmlTransport } from "./transport";
import { createGooglePaTransport } from "./transports/pa";
import { createGoogleV2Transport } from "./transports/v2";

const BATCH_PACK_RATIO = 0.9;

function googleProvider(id: string, createTransport: (env: Env) => GoogleHtmlTransport, userAgentOf: (job: ProviderJob) => string | undefined): TranslationProvider {
  return {
    id,
    translate: (input, job) => runEngine(createGoogleAdapter(id, createTransport(job.env), userAgentOf(job)), input, job, { requestChars: Math.floor(job.maxChars * BATCH_PACK_RATIO) }),
  };
}

export const googleNmtPaProvider = googleProvider("google-nmt-pa", createGooglePaTransport, (job) => job.clientUserAgent);

export const googleNmtV2Provider = googleProvider("google-nmt-v2", createGoogleV2Transport, () => undefined);

