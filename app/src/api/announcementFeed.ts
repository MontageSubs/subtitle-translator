import { ANNOUNCEMENT_INDEX_FILE, ANNOUNCEMENT_SLUG } from "../config/announcement";
import type { DocPage, HotAnnouncement, HotAnnouncementIndex } from "../types/docs";
import { persistentStorage } from "../utils/safeStorage";

export const ANNOUNCEMENT_CHANGED_EVENT = "subtitle-translator:announcement-changed";

const STORAGE_PREFIX = "subtitle-translator:announcement:";
const FETCH_TIMEOUT_MS = 6_000;

const storageKey = (locale: string): string => `${STORAGE_PREFIX}${locale}`;

export const readHotAnnouncement = (locale: string): HotAnnouncement | null => persistentStorage.readJson<HotAnnouncement>(storageKey(locale));

async function fetchJson<T>(path: string, cache: RequestCache): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal: controller.signal, cache });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface HotRefresh {
  reachable: boolean;
  changed: boolean;
}

const UNREACHABLE: HotRefresh = { reachable: false, changed: false };

export async function refreshHotAnnouncement(locale: string): Promise<HotRefresh> {
  const index = await fetchJson<HotAnnouncementIndex>(ANNOUNCEMENT_INDEX_FILE, "no-store");
  if (!Array.isArray(index?.entries)) return UNREACHABLE;
  const entry = index.entries.find((candidate) => candidate.locale === locale);
  const stored = readHotAnnouncement(locale);
  if (!entry) {
    if (!stored) return { reachable: true, changed: false };
    persistentStorage.removeItem(storageKey(locale));
  } else {
    if (stored?.rev === entry.rev) return { reachable: true, changed: false };
    const body = await fetchJson<HotAnnouncement>(entry.path, "default");
    if (body?.rev !== entry.rev) return UNREACHABLE;
    persistentStorage.writeJson(storageKey(locale), body);
  }
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_CHANGED_EVENT));
  return { reachable: true, changed: true };
}

export function withHotAnnouncement(page: DocPage): DocPage {
  if (page.slug !== ANNOUNCEMENT_SLUG || !page.siteWide) return page;
  const hot = readHotAnnouncement(page.locale);
  return hot ? { ...page, title: hot.title, heading: hot.heading, summary: hot.summary, html: hot.html, updatedAt: hot.updatedAt, hotShell: false } : page;
}
