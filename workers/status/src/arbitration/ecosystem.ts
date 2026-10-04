import { ALL_STATUS_PROVIDERS, ProviderReport } from "../providers/index";

export interface EcosystemGroup {
  key: string;
  groupName: string;
  memberIds: string[];
}

const ECOSYSTEM_GROUPS: EcosystemGroup[] = [
  { key: "google", groupName: "Google Cloud & Translation Services", memberIds: ["google_pa", "google_v2", "upstream_google"] },
  { key: "microsoft", groupName: "Microsoft Azure & Translation Services", memberIds: ["microsoft_translator", "upstream_azure"] },
  { key: "storage", groupName: "Turso & Cloud Storage Services", memberIds: ["upstream_storage"] },
  { key: "cloudflare", groupName: "Cloudflare Edge Network", memberIds: ["upstream_cloudflare"] },
  { key: "github", groupName: "GitHub Pages & Hosting Infrastructure", memberIds: ["upstream_github"] },
  { key: "deepl", groupName: "DeepL Translation API", memberIds: ["deepl_api"] },
];

export function listEcosystemGroups(): EcosystemGroup[] {
  const grouped = new Set(ECOSYSTEM_GROUPS.flatMap((g) => g.memberIds));
  const standalone = ALL_STATUS_PROVIDERS.filter((p) => !grouped.has(p.id)).map((p) => ({
    key: p.id,
    groupName: p.name,
    memberIds: [p.id],
  }));
  return [...ECOSYSTEM_GROUPS, ...standalone];
}

const BRAND_STATUS_NAMES: Array<[RegExp, string]> = [
  [/google\s*cloud/i, "Google Cloud Status"],
  [/azure|microsoft\s*azure/i, "Microsoft Azure Status"],
  [/cloudflare/i, "Cloudflare Status"],
  [/github/i, "GitHub Status"],
  [/deepl/i, "DeepL Status"],
  [/turso/i, "Turso Status"],
];

function simplifyBrandStatusName(rawName: string): string {
  const name = String(rawName || "").replace(/ \(.*\)/, "").trim();
  const brand = BRAND_STATUS_NAMES.find(([pattern]) => pattern.test(name));
  if (brand) return brand[1];

  const cleaned = name
    .replace(/\s*(?:Global|Platform|Edge)?\s*Infrastructure.*/i, "")
    .replace(/\s*(?:API|Engine).*/i, "")
    .trim();
  return cleaned.toLowerCase().endsWith("status") ? cleaned : `${cleaned} Status`;
}

export function buildExternalReferences(reports: ProviderReport[]): Array<{ name: string; url: string }> {
  const byUrl = new Map<string, { name: string; url: string }>();
  for (const report of reports) {
    if (report.referenceUrl) {
      byUrl.set(report.referenceUrl, { name: simplifyBrandStatusName(report.name), url: report.referenceUrl });
    }
  }
  return [...byUrl.values()];
}
