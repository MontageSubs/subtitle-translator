export interface TrackNameFlags {
  isForced: boolean;
  isHearingImpaired: boolean;
}

interface RegionRule {
  base: string;
  pattern: RegExp;
  region: string;
}

const HEARING_IMPAIRED = /\bsdh\b|\bhoh\b|\bcc\b|closed[\s-]*captions?|hearing[\s-]*impaired|hard[\s-]*of[\s-]*hearing|\bdeaf\b|\bsme\b|malentendant|sourds?\b|sordos?\b|hörgeschädigt|听障|聽障|听力障碍|聽力障礙|聋哑|聾啞|聋人|聾人/giu;
const FORCED = /\bforced\b|\bforzad[oa]s?\b|\bforc[eé]s?\b|\bforzati\b|\berzwungen\b|\bfpo\b|foreign[\s-]*parts?(?:[\s-]*only)?|强制|強制|強迫|仅外语|僅外語/giu;
const EXPLICIT_REGION_TAG = /\b([a-z]{2,3})[-_]([a-z]{2}|\d{3})\b/i;
const SEPARATORS = /[\s()[\]{}\-–—_.,;:/|·•&+]+/gu;

const REGION_RULES: readonly RegionRule[] = [
  { base: "es", pattern: /latin ?americ|latinoameric|hispanoameric|america latina|\blatam\b|\blatino\b/u, region: "419" },
  { base: "es", pattern: /mexic/u, region: "MX" },
  { base: "es", pattern: /espana|spain|castilian|castellano|european|europeo|peninsular|iberian/u, region: "ES" },
  { base: "es", pattern: /argentin/u, region: "AR" },
  { base: "pt", pattern: /brazil|brasil/u, region: "BR" },
  { base: "pt", pattern: /portugal|european|europeu|iberian/u, region: "PT" },
  { base: "fr", pattern: /canad|quebec|quebecois|canfr/u, region: "CA" },
  { base: "fr", pattern: /\bfrance\b|metropol/u, region: "FR" },
  { base: "fr", pattern: /belg/u, region: "BE" },
  { base: "fr", pattern: /suisse|swiss/u, region: "CH" },
  { base: "en", pattern: /united states|\busa?\b|american/u, region: "US" },
  { base: "en", pattern: /united kingdom|\buk\b|british|england|\bgb\b/u, region: "GB" },
  { base: "en", pattern: /australia/u, region: "AU" },
  { base: "en", pattern: /canad/u, region: "CA" },
  { base: "en", pattern: /india/u, region: "IN" },
  { base: "de", pattern: /austria|osterreich/u, region: "AT" },
  { base: "de", pattern: /swiss|schweiz|suisse/u, region: "CH" },
  { base: "nl", pattern: /belg|vlaams|flemish/u, region: "BE" },
];

const normalized = (name: string): string => name.normalize("NFKC").toLowerCase();
const withoutAccents = (text: string): string => text.normalize("NFD").replace(/\p{M}+/gu, "");

export function flagsFromTrackName(name: string | null): TrackNameFlags {
  const text = name ? normalized(name) : "";
  return { isForced: new RegExp(FORCED.source, "iu").test(text), isHearingImpaired: new RegExp(HEARING_IMPAIRED.source, "iu").test(text) };
}

export function regionFromTrackName(name: string | null, base: string): string | null {
  if (!name) return null;
  const explicit = EXPLICIT_REGION_TAG.exec(name.normalize("NFKC"));
  if (explicit && explicit[1].toLowerCase() === base) return explicit[2].toUpperCase();
  const text = withoutAccents(normalized(name));
  return REGION_RULES.find((rule) => rule.base === base && rule.pattern.test(text))?.region ?? null;
}

export function regionFromTag(tag: string | null, base: string): string | null {
  if (!tag) return null;
  const [language, ...subtags] = tag.split(/[-_]/);
  if (language.toLowerCase() !== base) return null;
  const region = subtags.find((part) => /^(?:[a-z]{2}|\d{3})$/i.test(part));
  return region ? region.toUpperCase() : null;
}

export function residualTrackName(name: string | null, languageNames: readonly string[]): string | null {
  if (!name) return null;
  const plainNames = languageNames.map((candidate) => withoutAccents(normalized(candidate)));
  const known = new Set(plainNames.flatMap((candidate) => [candidate.replace(SEPARATORS, ""), ...candidate.split(SEPARATORS)]).filter(Boolean));
  const withoutTraits = withoutAccents(normalized(name)).replace(HEARING_IMPAIRED, " ").replace(FORCED, " ");
  const stripped = REGION_RULES.reduce((text, { pattern }) => text.replace(new RegExp(pattern.source, "gu"), " "), withoutTraits);
  const words = stripped.split(SEPARATORS).filter(Boolean);
  const unexplained = words.filter((word) => !known.has(word) && !/^(?:[a-z]{2,3}|\d{3})$/.test(word));
  return unexplained.length ? name.trim() : null;
}
