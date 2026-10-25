import { runEngine } from "../../engine/run";
import type { ProviderJob, TranslationProvider } from "../../types";
import { createGoogleAdapter } from "./dialect";
import type { GoogleHtmlTransport } from "./transport";
import { createGooglePaTransport } from "./transports/pa";
import { createGoogleV2Transport } from "./transports/v2";

const BATCH_PACK_RATIO = 0.9;

const requestCharsOf = (maxChars: number): number => Math.floor(maxChars * BATCH_PACK_RATIO);

function googleProvider(id: string, createTransport: (job: ProviderJob) => GoogleHtmlTransport, userAgentOf: (job: ProviderJob) => string | undefined): TranslationProvider {
  return {
    id,
    requestChars: requestCharsOf,
    translate: (input, job) => runEngine(createGoogleAdapter(id, createTransport(job), userAgentOf(job)), input, job, { requestChars: requestCharsOf(job.maxChars) }),
  };
}

export const googleNmtPaProvider = googleProvider("google-nmt-pa", (job) => createGooglePaTransport(job.env, job.paRegion), (job) => job.clientUserAgent);

export const googleNmtV2Provider = googleProvider("google-nmt-v2", (job) => createGoogleV2Transport(job.env), () => undefined);

