export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function reportFault(label: string, error: unknown, ipTag?: string | null): void {
  console.error(`[fault] ${label}: ${errorMessage(error)}${ipTag ? ` (ipHash: ${ipTag})` : ""}`);
}
