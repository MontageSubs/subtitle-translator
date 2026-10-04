import { Env } from "../../config";
import {
  ProviderExecutionContext,
  ProviderIdentity,
  ProviderOutcome,
  ProviderReport,
  StatusProvider,
} from "./types";
import { logSystemError, logDiagnostic } from "../../logger";

export function defineProvider(
  identity: ProviderIdentity,
  run: (env: Env, context: ProviderExecutionContext) => Promise<ProviderOutcome>,
): StatusProvider {
  return {
    ...identity,
    execute: async (env, context) => ({ ...identity, ...(await run(env, context)) }),
  };
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
    const { id, name, group, referenceUrl } = provider;
    return {
      id,
      name,
      group,
      status: "degraded_performance",
      referenceUrl,
      coreImpact: { affected: false, status: "operational" },
      raw: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}
