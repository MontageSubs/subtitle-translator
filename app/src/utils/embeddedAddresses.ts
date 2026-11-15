const TOP_LEVEL_DOMAINS = "com|net|org|io|co|cn|tv|me|info|edu|gov|app|dev|xyz|uk|us|ru|jp|de|fr|es|br|ly|fm";

const EMBEDDED_ADDRESS = new RegExp(`(?:https?://|www\\.)\\S+|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|\\b[\\w-]+(?:\\.[\\w-]+)*\\.(?:${TOP_LEVEL_DOMAINS})\\b(?:/\\S*)?`, "gi");

export const withoutEmbeddedAddresses = (text: string): string => text.replace(EMBEDDED_ADDRESS, " ");
