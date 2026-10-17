import { ipTag } from "./trace";

const MAX_FAULT_CHARS = 300;

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const describeError = (error: unknown): string => (error instanceof SyntaxError ? error.name : errorMessage(error)).slice(0, MAX_FAULT_CHARS);

export function reportFault(label: string, error: unknown, ipHash?: string): void {
  const tag = ipTag(ipHash);
  console.error(`[fault] ${label}: ${describeError(error)}${tag ? ` (ipHash: ${tag})` : ""}`);
}
