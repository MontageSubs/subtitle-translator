export function normalizeMicrosoftLang(langCode: string | undefined): string {
  const lc = (langCode || "").toLowerCase();
  if (["zh", "zh-cn", "zh-hans", "zh-sg"].includes(lc)) return "zh-Hans";
  if (["zh-tw", "zh-hk", "zh-mo", "zh-hant"].includes(lc)) return "zh-Hant";
  if (lc === "auto") return "";
  return langCode || "";
}

export function primarySubtag(langCode: string | undefined): string {
  return (langCode || "").split("-")[0].toLowerCase();
}
