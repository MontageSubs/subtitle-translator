const SIMPLIFIED = new Set(["zh", "zh-cn", "zh-hans", "zh-sg"]);
const TRADITIONAL = new Set(["zh-tw", "zh-hk", "zh-mo", "zh-hant"]);

export function normalizeMicrosoftLang(code: string | undefined): string {
  const lower = (code || "").toLowerCase();
  if (SIMPLIFIED.has(lower)) return "zh-Hans";
  if (TRADITIONAL.has(lower)) return "zh-Hant";
  return lower === "auto" ? "" : code || "";
}
