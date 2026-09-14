import { ComponentStatus } from "../../types";
import { Env } from "../../index";
import {
  StatusProvider,
  ProviderReport,
  ProviderExecutionContext,
} from "./types";
import { logSystemError, logDiagnostic } from "../../logger";

export function mapStatusIndicator(indicator?: string): ComponentStatus {
  if (!indicator) return "operational";
  const s = indicator.toLowerCase();
  if (s === "major" || s === "critical") return "major_outage";
  if (s === "minor") return "degraded_performance";
  return "operational";
}

export async function safeExecuteProvider(
  provider: StatusProvider,
  env: Env,
  context: ProviderExecutionContext,
): Promise<ProviderReport> {
  const started = Date.now();
  try {
    const report = await provider.execute(env, context);
    logDiagnostic(
      `Provider:${provider.id}`,
      `Status: ${report.status} | Latency: ${Date.now() - started}ms | Incidents: ${report.activeIncidents?.length || 0}`,
    );
    return report;
  } catch (err) {
    logSystemError(`Provider:${provider.id}`, err);
    return {
      id: provider.id,
      name: provider.name,
      group: provider.group,
      status: "degraded_performance",
      referenceUrl: provider.referenceUrl,
      coreImpact: { affected: false, status: "operational" },
      raw: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}
