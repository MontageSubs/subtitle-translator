import { CHANNEL } from "../config/channel";
import { PRODUCTION_CHANNEL } from "../config/channelProfile";
import { STORAGE_KEYS } from "../config/storage";
import { hasUnsavedChanges } from "../lib/unsavedChanges";
import { tabStorage } from "../utils/safeStorage";
import { recommendedUrlOf } from "../api/broadcastEndpoint";
import { broadcastEndpointOf, type StatusSnapshot } from "../api/statusApi";

const MIGRATION_RETRY_GUARD_MS = 10 * 60_000;

const withTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

function recentlyMigrated(): boolean {
  const at = Number(tabStorage.getItem(STORAGE_KEYS.siteMigrationAt));
  return Number.isFinite(at) && Date.now() - at < MIGRATION_RETRY_GUARD_MS;
}

function relocatedTarget(snapshot: StatusSnapshot): URL | null {
  const endpoint = broadcastEndpointOf(snapshot, "web_app");
  if (!endpoint || endpoint.recommendedSource !== "redirect_target") return null;
  const recommendedUrl = recommendedUrlOf(endpoint);
  if (!URL.canParse(recommendedUrl) || !URL.canParse(endpoint.primaryUrl)) return null;
  const target = new URL(withTrailingSlash(recommendedUrl));
  const current = new URL(import.meta.env.BASE_URL, location.origin);
  const servedFromPrimary = new URL(endpoint.primaryUrl).origin === location.origin;
  return target.protocol === "https:" && servedFromPrimary && target.href !== current.href ? target : null;
}

export function followWebAppRelocation(snapshot: StatusSnapshot): void {
  if (!import.meta.env.PROD || CHANNEL.id !== PRODUCTION_CHANNEL || recentlyMigrated() || hasUnsavedChanges()) return;
  const target = relocatedTarget(snapshot);
  if (!target) return;
  const base = import.meta.env.BASE_URL;
  const route = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : "";
  tabStorage.setItem(STORAGE_KEYS.siteMigrationAt, String(Date.now()));
  location.replace(`${target.href}${route}${location.search}${location.hash}`);
}
