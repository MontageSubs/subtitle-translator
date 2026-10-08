import { translate } from "../../src/i18n/dictionaries";
import type { AnnouncementItem } from "../../src/types/docs";
import { splitFrontmatter } from "./markdown";

const DEFAULT_ANNOUNCEMENT_ID = "default";
const TITLE_PATTERN = /^#\s+(.+)$/m;

export interface AnnouncementSource {
  title: string;
  markdown: string;
  tickerItems: AnnouncementItem[];
  announcementId: string;
}

function readTickerItems(data: Record<string, unknown>): AnnouncementItem[] {
  const entries = Array.isArray(data.items) ? data.items : [];
  return entries
    .map((entry) => ({ tone: (entry?.tone as AnnouncementItem["tone"]) || "info", text: String(entry?.text || "").trim() }))
    .filter((item) => item.text);
}

function readAnnouncementId(data: Record<string, unknown>): string {
  return typeof data.id === "string" && data.id.trim() ? data.id.trim() : DEFAULT_ANNOUNCEMENT_ID;
}

export function parseAnnouncement(raw: string, locale: string): AnnouncementSource {
  const { data, body } = splitFrontmatter(raw);
  const label = translate(locale as Parameters<typeof translate>[0], "shell.announcementLabel");
  const tickerItems = readTickerItems(data);
  const hasBody = body.trim().length > 0;
  const markdown = hasBody ? body : `# ${label}\n\n${tickerItems.map((item) => `- ${item.text}`).join("\n")}\n`;
  const title = markdown.match(TITLE_PATTERN)?.[1]?.trim() || label;
  return {
    title,
    markdown,
    tickerItems: tickerItems.length ? tickerItems : [{ tone: "info", text: title }],
    announcementId: readAnnouncementId(data),
  };
}
