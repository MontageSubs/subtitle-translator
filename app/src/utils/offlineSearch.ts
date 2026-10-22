export function normalizeSearchText(value: string): string {
  return value.toLowerCase().normalize("NFKC");
}

export function matchesSearchIndex(query: string, normalizedHaystack: string): boolean {
  const needle = normalizeSearchText(query.trim());
  return !needle || normalizedHaystack.includes(needle);
}

export function offlineSearchMatch(query: string, ...fields: (string | undefined)[]): boolean {
  return matchesSearchIndex(query, normalizeSearchText(fields.filter(Boolean).join("\n")));
}

export function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
