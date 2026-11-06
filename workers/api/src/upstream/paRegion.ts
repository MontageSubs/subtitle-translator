export type PaRegion = "global" | "eu" | "us";

const EUROPE_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
]);

const AMERICAS_CONTINENTS: ReadonlySet<string> = new Set(["NA", "SA"]);

export function paRegionFor(request: Request): PaRegion {
  const { country, continent } = (request as Request & { cf?: { country?: string; continent?: string } }).cf ?? {};
  if (country && EUROPE_COUNTRIES.has(country)) return "eu";
  if (continent && AMERICAS_CONTINENTS.has(continent)) return "us";
  return "global";
}

export function paRoute(preferred: PaRegion): PaRegion[] {
  if (preferred === "global") return Math.random() < 0.5 ? ["global", "eu", "us"] : ["global", "us", "eu"];
  return [preferred, "global", preferred === "eu" ? "us" : "eu"];
}

export const PA_ENDPOINTS: Readonly<Record<PaRegion, string>> = {
  global: "https://translate-pa.googleapis.com/v1/translateHtml",
  eu: "https://translate-pa.eu.rep.googleapis.com/v1/translateHtml",
  us: "https://translate-pa.us.rep.googleapis.com/v1/translateHtml",
};
