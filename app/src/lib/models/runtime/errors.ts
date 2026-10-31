export type ModelErrorCode = "missing" | "memory" | "corrupt" | "incompatible" | "load" | "runtime" | "aborted" | "internal";

export class ModelError extends Error {
  constructor(readonly code: ModelErrorCode, readonly origin?: unknown) {
    super(code);
  }
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

export function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  return new ModelError(isAbort(error) ? "aborted" : "internal", error);
}
