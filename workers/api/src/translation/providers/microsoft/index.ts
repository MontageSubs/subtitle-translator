import { runEngine } from "../../engine/run";
import type { TranslationProvider } from "../../types";
import { createMicrosoftAdapter } from "./dialect";
import { resolveEdgeUserAgent } from "./transport";

const DEFAULT_REQUEST_CHARS = 8000;

export const microsoftNmtEdgeProvider: TranslationProvider = {
  id: "microsoft-nmt-edge",
  translate: (input, job) =>
    runEngine(createMicrosoftAdapter(resolveEdgeUserAgent(job.clientUserAgent)), input, job, { requestChars: job.maxChars || DEFAULT_REQUEST_CHARS }),
};
