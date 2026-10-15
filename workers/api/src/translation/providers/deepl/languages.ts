export type DeeplRole = "source" | "target" | "glossary";

export function toDeeplLang(code: string, role: DeeplRole): string {
  if (!code || code === "auto") return "";
  const upper = code.toUpperCase();
  return role === "target" ? upper : upper.split("-")[0];
}
