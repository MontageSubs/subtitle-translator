export interface TursoConfig {
  url: string;
  authToken: string;
}

export interface Stats {
  total: number;
  last24h: number;
}

const BUCKET_MS = 3_600_000;

function pipelineUrl(rawUrl: string): string {
  return `${rawUrl.trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "")}/v2/pipeline`;
}

function extractScalar(result: any, index: number): number {
  const row = result?.results?.[index]?.response?.result?.rows?.[0]?.[0];
  return Number(row?.value ?? 0) || 0;
}

export async function readStats(config: TursoConfig): Promise<Stats> {
  console.info({ message: "[Turso] Executing stats query against pipeline", module: "Turso", event: "query_start" });
  const dayAgoBucket = Math.floor((Date.now() - 86_400_000) / BUCKET_MS) * BUCKET_MS;
  const response = await fetch(pipelineUrl(config.url), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly" } },
        {
          type: "execute",
          stmt: {
            sql: "SELECT COALESCE(SUM(count),0) FROM translation_stats_hourly WHERE bucket_start > ?",
            args: [{ type: "integer", value: String(dayAgoBucket) }],
          },
        },
        { type: "close" },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const errorReason = `turso responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
    console.error({
      message: `[Turso] Stats query failed (Status: ${response.status}): ${detail.slice(0, 200)}`,
      module: "Turso",
      event: "query_failed",
      status: response.status,
      reason: detail.slice(0, 200)
    });
    throw new Error(errorReason);
  }
  const result = await response.json();
  const stats = { total: extractScalar(result, 0), last24h: extractScalar(result, 1) };
  console.info({
    message: `[Turso] Stats query successful (Total: ${stats.total}, Last24h: ${stats.last24h})`,
    module: "Turso",
    event: "query_success",
    total: stats.total,
    last24h: stats.last24h
  });
  return stats;
}
