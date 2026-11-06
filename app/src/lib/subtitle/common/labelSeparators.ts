const LABEL_COLON_CHARS = ":\uff1a\ufe30\ufe55\u2236\ua789";

export const LABEL_COLON_CLASS = `[${LABEL_COLON_CHARS}]`;
export const LABEL_COLON_PATTERN = new RegExp(LABEL_COLON_CLASS);
export const TRAILING_LABEL_COLONS_PATTERN = new RegExp(`${LABEL_COLON_CLASS}+$`);
export const SPACED_LABEL_COLON_PATTERN = new RegExp(`\\s+(${LABEL_COLON_CLASS})`, "g");
