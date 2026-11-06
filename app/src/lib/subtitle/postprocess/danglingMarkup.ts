const CLOSING_ONLY_LINE = /[ \t]*\n[ \t]*((?:<\/(?:i|b|u)>|\{[^}]*\})+)\s*$/;
const OPENING_ONLY_LINE = /^((?:<(?:i|b|u)>|\{[^}]*\})+)[ \t]*\n[ \t]*/;

export function attachDanglingMarkup(text: string): string {
  if (!text.includes("\n") || (!text.includes("<") && !text.includes("{"))) return text;
  return text.replace(CLOSING_ONLY_LINE, "$1").replace(OPENING_ONLY_LINE, "$1");
}
