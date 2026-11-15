export interface TrackNameFlags {
  isForced: boolean;
  isHearingImpaired: boolean;
}

interface RegionRule {
  base: string;
  pattern: RegExp;
  region: string;
}

const HEARING_IMPAIRED_TERMS = [
  String.raw`\bsdh\b`, String.raw`\bhoh\b`, String.raw`\bcc\b`, String.raw`\bsme\b`, String.raw`\blse\b`, String.raw`\bsps\b`,
  String.raw`closed[\s-]*captions?`, String.raw`hearing[\s-]*(?:impaired|impairment|loss)`, String.raw`hard[\s-]*of[\s-]*hearing`, String.raw`\bdeaf\b`, String.raw`for the deaf`,
  String.raw`malentendant`, String.raw`\bsourds?\b`, String.raw`pour sourds`,
  String.raw`\bsordos?\b`, String.raw`para sordos`, String.raw`personas sordas`, String.raw`hipoacusi`,
  String.raw`horgeschadigt`, String.raw`gehorlos`, String.raw`schwerhorig`,
  String.raw`non udenti`, String.raw`non-udenti`, String.raw`\bsordi\b`, String.raw`ipoacusic`,
  String.raw`\bsurdos?\b`, String.raw`ensurdecid`, String.raw`deficiencia auditiva`, String.raw`legenda oculta`,
  String.raw`slechthorend`, String.raw`\bdoven\b`, String.raw`horselskadad`, String.raw`horehamm`, String.raw`horselshemm`, String.raw`kuulovammai`,
  String.raw`nieslyszac`, String.raw`neslysici`, String.raw`isitme engel`, String.raw`\bsagir`,
  "слабослышащ", "для глухих", "глухих", "слабочуваю",
  "聴覚障害", "聴覚", "청각", "청각장애", "听障", "聽障", "听力障碍", "聽力障礙", "聋哑", "聾啞", "聋人", "聾人", "听觉障碍", "聽覺障礙", "无障碍", "無障礙",
  "للصم", "ضعاف السمع", "לכבדי שמיעה", "לחירשים", "κωφ", "ακοης",
];

const FORCED_TERMS = [
  String.raw`\bforced\b`, String.raw`\bfpo\b`, String.raw`foreign[\s-]*(?:parts?|language|dialogue|only)?\b`, String.raw`non[\s-]*english`, String.raw`forced[\s-]*narrative`,
  String.raw`\bforzad[oa]s?\b`, String.raw`\bforc[ea]d[oa]s?\b`, String.raw`\bforces?\b`, String.raw`\bforzati\b`, String.raw`\bforzata\b`, String.raw`erzwungen`, String.raw`\bgedwongen\b`,
  String.raw`tvingande`, String.raw`wymuszone`, String.raw`vynucen`, String.raw`zorunlu`,
  String.raw`signs?[\s&+/-]*(?:and[\s]*)?songs?`, String.raw`signs? only`, String.raw`songs? only`,
  "принудительн", "вынужден", "форсирован", "强制", "強制", "強迫", "仅外语", "僅外語", "外语部分", "外語部分", "강제", "強制表示",
];

const HEARING_IMPAIRED = new RegExp(HEARING_IMPAIRED_TERMS.join("|"), "giu");
const FORCED = new RegExp(FORCED_TERMS.join("|"), "giu");
const BRACKETED_REGION = /[(\[]\s*([a-z]{2})\s*[)\]]/gi;
const EXPLICIT_REGION_TAG = /\b([a-z]{2,3})[-_]([a-z]{2}|\d{3})\b/i;
const SEPARATORS = /[\s()[\]{}\-–—_.,;:/|·•&+]+/gu;

const REGION_RULES: readonly RegionRule[] = [
  { base: "es", pattern: /latin ?americ|latinoameric|hispanoameric|america latina|\blatam\b|\blatino\b|[(\[]\s*la\s*[)\]]/u, region: "419" },
  { base: "es", pattern: /mexic/u, region: "MX" },
  { base: "es", pattern: /espana|spain|castilian|castellano|european|europeo|peninsular|iberian/u, region: "ES" },
  { base: "es", pattern: /argentin/u, region: "AR" },
  { base: "es", pattern: /colombia/u, region: "CO" },
  { base: "es", pattern: /chile/u, region: "CL" },
  { base: "pt", pattern: /angola/u, region: "AO" },
  { base: "pt", pattern: /brazil|brasil|brasileir/u, region: "BR" },
  { base: "pt", pattern: /portugal|european|europeu|iberian/u, region: "PT" },
  { base: "fr", pattern: /canad|quebec|quebecois|canfr|\bcan\b/u, region: "CA" },
  { base: "fr", pattern: /\bfrance\b|metropol/u, region: "FR" },
  { base: "fr", pattern: /belg/u, region: "BE" },
  { base: "fr", pattern: /suisse|swiss/u, region: "CH" },
  { base: "en", pattern: /united states|\busa?\b|american/u, region: "US" },
  { base: "en", pattern: /united kingdom|\buk\b|british|england|\bgb\b/u, region: "GB" },
  { base: "en", pattern: /australia|aussie/u, region: "AU" },
  { base: "en", pattern: /canad/u, region: "CA" },
  { base: "en", pattern: /india/u, region: "IN" },
  { base: "de", pattern: /austria|osterreich/u, region: "AT" },
  { base: "de", pattern: /swiss|schweiz|suisse/u, region: "CH" },
  { base: "ar", pattern: /saudi|\bksa\b/u, region: "SA" },
  { base: "ar", pattern: /egypt|masri/u, region: "EG" },
  { base: "ar", pattern: /lebanon|lebanese/u, region: "LB" },
  { base: "ar", pattern: /morocc|maghreb/u, region: "MA" },
  { base: "ar", pattern: /emirat|\buae\b/u, region: "AE" },
  { base: "nl", pattern: /belg|vlaams|flemish/u, region: "BE" },
];

const normalized = (name: string): string => name.normalize("NFKC").toLowerCase();
const withoutAccents = (text: string): string => text.normalize("NFD").replace(/\p{M}+/gu, "");

const searchable = (name: string): string => withoutAccents(normalized(name));

export function flagsFromTrackName(name: string | null): TrackNameFlags {
  if (!name) return { isForced: false, isHearingImpaired: false };
  const text = searchable(name);
  const tokens = text.split(SEPARATORS).filter(Boolean);
  const hiByAbbreviation = tokens.length > 1 ? /\bhi\b/.test(text) : false;
  return {
    isForced: new RegExp(FORCED.source, "iu").test(text),
    isHearingImpaired: new RegExp(HEARING_IMPAIRED.source, "iu").test(text) || hiByAbbreviation || /[(\[]\s*hi\s*[)\]]/.test(text),
  };
}

export function regionFromTrackName(name: string | null, base: string): string | null {
  if (!name) return null;
  const explicit = EXPLICIT_REGION_TAG.exec(name.normalize("NFKC"));
  if (explicit && explicit[1].toLowerCase() === base) return explicit[2].toUpperCase();
  const text = searchable(name);
  const byRule = REGION_RULES.find((rule) => rule.base === base && rule.pattern.test(text))?.region;
  if (byRule) return byRule;
  const known = new Set(REGION_RULES.filter((rule) => rule.base === base).map((rule) => rule.region));
  for (const match of text.matchAll(BRACKETED_REGION)) if (known.has(match[1].toUpperCase())) return match[1].toUpperCase();
  return null;
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
