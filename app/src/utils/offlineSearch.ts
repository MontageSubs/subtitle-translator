function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKC");
}

export function offlineSearchMatch(query: string, ...fields: (string | undefined)[]): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = normalize(fields.filter(Boolean).join("\n"));
  return haystack.includes(needle);
}

export function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
