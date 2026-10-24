import { ANNOUNCEMENT_INDEX_FILE, announcementBodyFile } from "../config/announcement";
import type { Announcement, AnnouncementIndex, DocPage } from "../types/docs";
import { persistentStorage } from "../utils/safeStorage";

export const ANNOUNCEMENT_CHANGED_EVENT = "subtitle-translator:announcement-changed";

const STORAGE_PREFIX = "subtitle-translator:announcement:";
const FETCH_TIMEOUT_MS = 6_000;

const storageKey = (locale: string): string => `${STORAGE_PREFIX}${locale}`;

export const readAnnouncement = (locale: string): Announcement | null => persistentStorage.readJson<Announcement>(storageKey(locale));

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

function commit(locale: string, announcement: Announcement | null): void {
  if (announcement) persistentStorage.writeJson(storageKey(locale), announcement);
  else persistentStorage.removeItem(storageKey(locale));
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_CHANGED_EVENT));
}

export async function checkAnnouncement(locale: string): Promise<boolean> {
  const index = await fetchJson<AnnouncementIndex>(ANNOUNCEMENT_INDEX_FILE, "no-cache");
  if (!Array.isArray(index?.entries)) return false;
  const meta = index.entries.find((entry) => entry.locale === locale);
  const stored = readAnnouncement(locale);
  if (!meta) {
    if (stored) commit(locale, null);
    return true;
  }
  if (stored?.rev === meta.rev) return true;
  const body = await fetchJson<Announcement>(announcementBodyFile(locale, meta.rev), "default");
  if (body?.rev !== meta.rev) return false;
  commit(locale, body);
  return true;
}

export function withAnnouncement(page: DocPage): DocPage {
  if (!page.hotShell) return page;
  const stored = readAnnouncement(page.locale);
  if (!stored) return page;
  const { title, heading, summary, html, createdAt, updatedAt } = stored;
  return { ...page, title, heading, summary, html, createdAt, updatedAt, hotShell: false };
}
