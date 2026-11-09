import { ReportedServiceEndpoints } from "../types";

const PRIMARY_KEY = "endpoint_primary";
const FALLBACK_KEY = "endpoint_fallback";

const isUrl = (value: string | undefined): value is string => value !== undefined && URL.canParse(value);

export async function readReportedServiceEndpoints(db: D1Database | undefined): Promise<ReportedServiceEndpoints | null> {
  if (!db) return null;
  const { results } = await db
    .prepare("SELECT key, value FROM system_config WHERE key IN (?1, ?2)")
    .bind(PRIMARY_KEY, FALLBACK_KEY)
    .all<{ key: string; value: string }>();
  const stored = new Map(results.map(({ key, value }) => [key, value]));
  const primary = stored.get(PRIMARY_KEY);
  const fallback = stored.get(FALLBACK_KEY);
  if (!isUrl(primary)) return null;
  return { primary, fallback: isUrl(fallback) ? fallback : "" };
}
