export const WORKER_URL: string = (import.meta.env.VITE_WORKER_URL || "").replace(/\/+$/, "");
export const STATS_URL: string = import.meta.env.VITE_STATS_URL || "";
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

export const REQUEST_TIMEOUT_MS = 30_000;
export const IDLE_STANDBY_MARGIN_MS = 2_000;

export function assertConfigured(): void {
  if (!WORKER_URL) {
    throw new Error("VITE_WORKER_URL is not configured: the static site needs it to reach the Worker. Set it in your deployment environment variables.");
  }
}
