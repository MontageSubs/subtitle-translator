export function normalizeMicrosoftLang(code: string | undefined): string {
  return !code || code.toLowerCase() === "auto" ? "" : code;
}
