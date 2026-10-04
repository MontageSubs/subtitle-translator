import { PagesEnv, deployAssets, fetchPublishedJson, fetchPublishedStatusJson } from "./pages";
import { buildSiteAssets } from "./assets";
import { SiteEnv, resolveSiteConfig } from "../config";
import { SystemStatusSnapshot, TranslationStats } from "../types";
import { reconcileSnapshotHistory } from "../snapshot/reconcile";
import { createBaselineSnapshot } from "../snapshot/baseline";
import { logSystemError } from "../logger";

export interface RepublishResult {
  success: boolean;
  error?: string;
}

export interface RepublishOptions {
  baselineWhenMissing?: boolean;
}

type SnapshotMutation = (snapshot: SystemStatusSnapshot) => SystemStatusSnapshot | Promise<SystemStatusSnapshot>;

export async function republishSnapshot(
  env: PagesEnv & SiteEnv,
  mutate: SnapshotMutation,
  { baselineWhenMissing = false }: RepublishOptions = {},
): Promise<RepublishResult> {
  const site = resolveSiteConfig(env);
  const [published, stats] = await Promise.all([
    fetchPublishedStatusJson(env),
    fetchPublishedJson<TranslationStats>(env, "stats.json"),
  ]);

  const base = published ?? (baselineWhenMissing ? createBaselineSnapshot(site.statusUrl) : null);
  if (!base) return { success: false, error: "no published snapshot found to republish from" };

  const snapshot = reconcileSnapshotHistory(await mutate(base));
  snapshot.meta.generatedAt = new Date().toISOString();

  const assets = buildSiteAssets(snapshot, { ...site, isMainSiteAvailable: true }, stats);
  const deployId = await deployAssets(env, assets).catch((error) => {
    logSystemError("AdminRepublish", error);
    return "";
  });
  return deployId ? { success: true } : { success: false, error: "publish failed" };
}
