type Level = "log" | "warn" | "error";

export const writeLine = (level: Level, scope: string, outcome: string, fields = ""): void => console[level](`[${scope}] ${outcome}${fields && ` ${fields}`}`);
