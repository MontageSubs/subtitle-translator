import { readStats } from "./turso";
import { publishSnapshot, pruneHistory } from "./pages";

export interface Env {
  TURSO_URL: string;
  TURSO_READ_AUTH_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_PAGES_API_TOKEN: string;
  CF_PAGES_PROJECT: string;
  ALLOWED_ORIGIN: string;
  STATS_STATE: KVNamespace;
}

const STATE_KEY = "last-published";
const DEPLOYMENTS_TO_KEEP = 3;

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const startTime = Date.now();
    console.info(`[Scheduled] Task started`);
    try {
      const stats = await readStats({ url: env.TURSO_URL, authToken: env.TURSO_READ_AUTH_TOKEN });
      const signature = `${stats.total}:${stats.last24h}`;
      const previousSignature = await env.STATS_STATE.get(STATE_KEY);
      if (previousSignature === signature) {
        console.info(`[Scheduled] Stats unchanged (KV: ${previousSignature} == Current: ${signature}), skipping deployment. Duration: ${Date.now() - startTime}ms`);
        return;
      }

      await publishSnapshot(env, [
        { path: "/stats.json", content: JSON.stringify({ ...stats, updatedAt: Date.now() }), contentType: "application/json" },
        {
          path: "/_headers",
          content: `/stats.json\n  Access-Control-Allow-Origin: ${env.ALLOWED_ORIGIN}\n  Cache-Control: public, max-age=300\n`,
          contentType: "",
        },
      ]);
      await env.STATS_STATE.put(STATE_KEY, signature);
      console.info(`[Scheduled] Successfully deployed new snapshot. KV: ${previousSignature || "null"} -> Current: ${signature}. Duration: ${Date.now() - startTime}ms`);

      ctx.waitUntil(
        pruneHistory(env, DEPLOYMENTS_TO_KEEP)
          .then(() => console.info(`[Scheduled] Prune history completed successfully`))
          .catch((error) => console.error(`[Scheduled] Failed to prune history: ${error instanceof Error ? error.message : String(error)}`))
      );
    } catch (error) {
      console.error(`[Scheduled] Task failed after ${Date.now() - startTime}ms: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
