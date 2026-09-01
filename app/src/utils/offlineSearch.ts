function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKC");
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle.length) return true;
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor++;
    if (cursor === needle.length) return true;
  }
  return false;
}

export function offlineFuzzyMatch(query: string, ...fields: (string | undefined)[]): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalize(fields.filter(Boolean).join("\n"));
  return tokens.every((token) => haystack.includes(token) || isSubsequence(token, haystack));
}

export function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
