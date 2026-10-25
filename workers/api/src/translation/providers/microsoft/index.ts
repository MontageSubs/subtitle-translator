import { runEngine } from "../../engine/run";
import type { TranslationProvider } from "../../types";
import { createMicrosoftAdapter } from "./dialect";
import { resolveEdgeUserAgent } from "../../../upstream/clientUserAgent";

const DEFAULT_REQUEST_CHARS = 8000;

const requestCharsOf = (maxChars: number): number => maxChars || DEFAULT_REQUEST_CHARS;

export const microsoftNmtEdgeProvider: TranslationProvider = {
  id: "microsoft-nmt-edge",
  requestChars: requestCharsOf,
  translate: (input, job) =>
    runEngine(createMicrosoftAdapter(resolveEdgeUserAgent(job.clientUserAgent)), input, job, { requestChars: requestCharsOf(job.maxChars) }),
};
