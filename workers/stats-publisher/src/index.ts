import { readStats } from "./turso";
import { publishSnapshot, pruneHistory, fetchPublishedSnapshot } from "./pages";

export interface Env {
  TURSO_URL: string;
  TURSO_READ_AUTH_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_PAGES_API_TOKEN: string;
  CF_PAGES_PROJECT: string;
  ALLOWED_ORIGIN: string;
  STATS_URL?: string;
}

const DEPLOYMENTS_TO_KEEP = 3;

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const startTime = Date.now();
    console.info({ message: "[Scheduled] Task started", module: "Scheduled", event: "task_start" });
    try {
      const stats = await readStats({ url: env.TURSO_URL, authToken: env.TURSO_READ_AUTH_TOKEN });
      const published = await fetchPublishedSnapshot(env);
      if (published && published.total === stats.total && published.last24h === stats.last24h) {
        console.info({
          message: `[Scheduled] Stats unchanged (Published: ${published.total}/${published.last24h} == Current: ${stats.total}/${stats.last24h}), skipping deployment. Duration: ${Date.now() - startTime}ms`,
          module: "Scheduled",
          event: "task_skipped",
          published,
          current: stats,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      const corsOrigin = (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN.includes(",")) ? "*" : env.ALLOWED_ORIGIN;
      await publishSnapshot(env, [
        { path: "/stats.json", content: JSON.stringify({ ...stats, updatedAt: Date.now() }), contentType: "application/json" },
        {
          path: "/_headers",
          content: `/stats.json\n  Access-Control-Allow-Origin: ${corsOrigin}\n  Cache-Control: public, max-age=300\n`,
          contentType: "",
        },
      ]);
      console.info({
        message: `[Scheduled] Successfully deployed new snapshot (Published: ${published ? `${published.total}/${published.last24h}` : "null"} -> Current: ${stats.total}/${stats.last24h}). Duration: ${Date.now() - startTime}ms`,
        module: "Scheduled",
        event: "task_success",
        previous: published,
        current: stats,
        durationMs: Date.now() - startTime,
      });

      ctx.waitUntil(
        pruneHistory(env, DEPLOYMENTS_TO_KEEP)
          .then(() => console.info({ message: "[Scheduled] Prune history completed successfully", module: "Scheduled", event: "prune_success" }))
          .catch((error) =>
            console.error({
              message: `[Scheduled] Failed to prune history: ${error instanceof Error ? error.message : String(error)}`,
              module: "Scheduled",
              event: "prune_failed",
              error: error instanceof Error ? error.message : String(error),
            })
          )
      );
    } catch (error) {
      console.error({
        message: `[Scheduled] Task failed after ${Date.now() - startTime}ms: ${error instanceof Error ? error.message : String(error)}`,
        module: "Scheduled",
        event: "task_failed",
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
