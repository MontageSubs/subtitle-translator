export type DeeplRole = "source" | "target" | "glossary";

const TARGET_DEFAULTS: Readonly<Record<string, string>> = { EN: "EN-US", PT: "PT-BR" };

export function toDeeplLang(code: string, role: DeeplRole): string {
  if (!code || code === "auto") return "";
  const upper = code.toUpperCase();
  return role === "target" ? (TARGET_DEFAULTS[upper] ?? upper) : upper.split("-")[0];
}
