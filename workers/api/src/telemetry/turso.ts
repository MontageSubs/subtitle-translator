import { egressFetch } from "../upstream/egress";

export interface TursoConfig {
  url: string;
  authToken: string;
}

type Arg = { type: "text" | "integer"; value: string };

export interface Statement {
  sql: string;
  args?: Arg[];
}

export const intArg = (value: number): Arg => ({ type: "integer", value: String(value) });
export const textArg = (value: string): Arg => ({ type: "text", value });

const SCHEMA: readonly Statement[] = [
  { sql: "CREATE TABLE IF NOT EXISTS translation_counter (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), total INTEGER NOT NULL DEFAULT 0)" },
  { sql: "CREATE TABLE IF NOT EXISTS metrics_bucketed (bucket_minute INTEGER NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bucket_minute, metric))" },
  { sql: "CREATE TABLE IF NOT EXISTS translation_daily (date TEXT PRIMARY KEY, total INTEGER NOT NULL)" },
  { sql: "CREATE TABLE IF NOT EXISTS translation_monthly (year_month TEXT PRIMARY KEY, total INTEGER NOT NULL)" },
  { sql: "CREATE TABLE IF NOT EXISTS translation_yearly (year TEXT PRIMARY KEY, total INTEGER NOT NULL)" },
];

const readyEndpoints = new Set<string>();

const pipelineUrl = (rawUrl: string): string => `${rawUrl.trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "")}/v2/pipeline`;

export interface TursoRow {
  value?: string | number | null;
}

export async function executeTurso(config: TursoConfig, statements: Statement[]): Promise<TursoRow[][][]> {
  const endpoint = pipelineUrl(config.url);
  const schema = readyEndpoints.has(endpoint) ? [] : SCHEMA;
  const response = await egressFetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        ...[...schema, ...statements].map((stmt) => ({ type: "execute", stmt: { sql: stmt.sql, args: stmt.args ?? [] } })),
        { type: "close" },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`turso responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  readyEndpoints.add(endpoint);
  const payload = (await response.json()) as { results?: { response?: { result?: { rows?: TursoRow[][] } } }[] };
  return statements.map((_, i) => payload.results?.[schema.length + i]?.response?.result?.rows ?? []) as unknown as TursoRow[][][];
}
