import { SITE_URL } from "../../../../config/environment";
import { assFontFor, sharesFontFamily, FontPlatform } from "./fontCatalog";
import { isAppleHost } from "./hostPlatform";
import type { StyleAlignments } from "./render";

const ASS_PLAY_RESOLUTION = { width: 1920, height: 1080 } as const;
const IMPLICIT_PLAY_RESOLUTION = { width: 384, height: 288 } as const;

function assStyleNameFor(langCode: string): string {
  return (langCode || "secondary").replace(/[^A-Za-z0-9-]/g, "");
}

const DEFAULT_ASS_STYLE = "Default";

export function cueStyleName(cueSettings: string | undefined): string {
  return cueSettings?.split("|")[1] || DEFAULT_ASS_STYLE;
}

export function secondaryStyleName(baseStyle: string, langCode: string): string {
  return `${baseStyle}-${assStyleNameFor(langCode)}`;
}

export interface AssFontPlan {
  primaryFont: string;
  primarySize: number;
  secondaryFont: string;
  secondarySize: number;
}

export type AssFontPreset = "desktop" | "mobile" | "custom";

const MOBILE_PRIMARY_SIZE = 100;
const MOBILE_SECONDARY_SIZE = 65;
const BASE_PRIMARY_SIZE = 70;
const BASE_SECONDARY_SIZE = 45;

export function fontPlatformFor(preset: AssFontPreset | undefined): FontPlatform {
  if (isAppleHost()) return "apple";
  return preset === "mobile" ? "android" : "windows";
}

const SECONDARY_SIZE_RATIO = BASE_SECONDARY_SIZE / BASE_PRIMARY_SIZE;
const MOBILE_SECONDARY_SIZE_RATIO = MOBILE_SECONDARY_SIZE / MOBILE_PRIMARY_SIZE;

export interface SourceAssSizing {
  primaryScale: number;
  secondaryRatio: number;
}

export function sourceAssSizing(preset: AssFontPreset | undefined, referenceSize: number, customPrimarySize: number | undefined, customSecondarySize: number | undefined): SourceAssSizing {
  if (preset === "custom" && customPrimarySize && customSecondarySize) {
    return { primaryScale: customPrimarySize / referenceSize, secondaryRatio: customSecondarySize / customPrimarySize };
  }
  return { primaryScale: 1, secondaryRatio: preset === "mobile" ? MOBILE_SECONDARY_SIZE_RATIO : SECONDARY_SIZE_RATIO };
}

export function sharesSourceAssSize(equalLayout: boolean, preset: AssFontPreset | undefined): boolean {
  return equalLayout && preset !== "custom";
}

export function scaledPrimarySize(size: number, sizing: SourceAssSizing): number {
  return size && Math.max(1, Math.round(size * sizing.primaryScale));
}

export function scaledSecondarySize(primarySize: number, equalSize: boolean, sizing: SourceAssSizing): number {
  return equalSize ? primarySize : Math.max(1, Math.round(primarySize * sizing.secondaryRatio));
}

function secondarySizeFor(primarySize: number, equalSize: boolean, preset: AssFontPreset | undefined, customSize?: number): number {
  if (customSize) return customSize;
  if (equalSize) return primarySize;
  return preset === "mobile" ? MOBILE_SECONDARY_SIZE : Math.round(primarySize * SECONDARY_SIZE_RATIO);
}

export interface AssFontOverrides {
  preset?: AssFontPreset;
  customPrimarySize?: number;
  customSecondarySize?: number;
}

export function defaultAssFontPlan(primaryLang: string, secondaryLang: string, bilingual: boolean, equalSize: boolean, overrides?: AssFontOverrides): AssFontPlan {
  const platform = fontPlatformFor(overrides?.preset);
  let primarySize = BASE_PRIMARY_SIZE;
  if (overrides?.preset === "mobile") primarySize = MOBILE_PRIMARY_SIZE;
  else if (overrides?.preset === "custom" && overrides.customPrimarySize) primarySize = overrides.customPrimarySize;
  const secondarySize = bilingual ? secondarySizeFor(primarySize, equalSize, overrides?.preset, overrides?.preset === "custom" ? overrides.customSecondarySize : undefined) : primarySize;
  return { primaryFont: assFontFor(primaryLang, platform), primarySize, secondaryFont: assFontFor(secondaryLang, platform), secondarySize };
}

const STYLE_FORMAT_FIELDS = ["Name", "Fontname", "Fontsize", "PrimaryColour", "SecondaryColour", "OutlineColour", "BackColour", "Bold", "Italic", "Underline", "StrikeOut", "ScaleX", "ScaleY", "Spacing", "Angle", "BorderStyle", "Outline", "Shadow", "Alignment", "MarginL", "MarginR", "MarginV", "Encoding"];
const STYLE_ROW_PATTERN = /^(Format|Style):/i;

interface StyleColumns {
  name: number;
  font: number;
  size: number;
}

function styleColumns(formatLine: string | undefined): StyleColumns {
  const fields = formatLine ? splitStyleFields(formatLine).map((f) => f.toLowerCase()) : STYLE_FORMAT_FIELDS.map((f) => f.toLowerCase());
  const at = (field: string, fallback: number) => {
    const index = fields.indexOf(field);
    return index === -1 ? fallback : index;
  };
  return { name: at("name", 0), font: at("fontname", 1), size: at("fontsize", 2) };
}

function splitStyleFields(line: string): string[] {
  return line.slice(line.indexOf(":") + 1).split(",").map((field) => field.trim());
}

export function assHeaderStyleSize(header: string, styleName: string): number | undefined {
  const lines = header.split("\n");
  const bounds = sectionBounds(lines, "[V4+ Styles]");
  if (!bounds) return undefined;
  const rows = lines.slice(bounds[0] + 1, bounds[1]).map((line) => line.trim());
  const columns = styleColumns(rows.find((row) => /^Format:/i.test(row)));
  const row = rows.find((candidate) => /^Style:/i.test(candidate) && splitStyleFields(candidate)[columns.name] === styleName);
  return row ? Number(splitStyleFields(row)[columns.size]) || undefined : undefined;
}

export interface AssMergeOptions {
  bilingual: boolean;
  usedStyles: string[];
  sourceLang: string;
  primaryLang: string;
  secondaryLang: string;
  equalSize: boolean;
  sizing: SourceAssSizing;
  platform: FontPlatform;
  stampComment: boolean;
}

const PLAY_RESOLUTION_PATTERN = /^PlayRes([XY]):\s*(\d+)/i;

function sectionBounds(lines: string[], title: string): [number, number] | undefined {
  const start = lines.findIndex((line) => line.trim() === title);
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < lines.length && !lines[end].trim().startsWith("[")) end++;
  return [start, end];
}

function declareMissingPlayResolution(lines: string[]): void {
  const bounds = sectionBounds(lines, "[Script Info]");
  if (!bounds) return;
  const declared = { X: 0, Y: 0 };
  for (const line of lines.slice(bounds[0] + 1, bounds[1])) {
    const match = PLAY_RESOLUTION_PATTERN.exec(line.trim());
    if (match) declared[match[1].toUpperCase() as "X" | "Y"] = Number(match[2]);
  }
  if (declared.X && declared.Y) return;
  const aspect = IMPLICIT_PLAY_RESOLUTION.width / IMPLICIT_PLAY_RESOLUTION.height;
  const height = declared.Y || (declared.X ? Math.round(declared.X / aspect) : IMPLICIT_PLAY_RESOLUTION.height);
  const width = declared.X || Math.round(height * aspect);
  const missing = [...(declared.X ? [] : [`PlayResX: ${width}`]), ...(declared.Y ? [] : [`PlayResY: ${height}`])];
  lines.splice(bounds[0] + 1, 0, ...missing);
}

export function mergeIntoOriginalAssHeader(originalHeader: string, options: AssMergeOptions): string {
  const { bilingual, usedStyles, sourceLang, primaryLang, secondaryLang, equalSize, sizing, platform, stampComment } = options;
  const lines = originalHeader.split("\n");

  const scriptInfoIdx = lines.findIndex((l) => l.trim() === "[Script Info]");
  if (stampComment && scriptInfoIdx !== -1) {
    let end = scriptInfoIdx + 1;
    while (end < lines.length && lines[end].trim().startsWith(";")) end++;
    lines.splice(scriptInfoIdx + 1, end - (scriptInfoIdx + 1), `; Translated and generated by Montage Subtitle Translator v${__APP_VERSION__} (${SITE_URL})`);
  }
  declareMissingPlayResolution(lines);

  const stylesBounds = sectionBounds(lines, "[V4+ Styles]");
  if (!stylesBounds) return lines.join("\n");
  const [stylesIdx, sectionEnd] = stylesBounds;

  const rows = lines.slice(stylesIdx + 1, sectionEnd).map((line) => line.trim());
  const columns = styleColumns(rows.find((row) => /^Format:/i.test(row)));
  const definedStyles = new Set(rows.filter((row) => /^Style:/i.test(row)).map((row) => splitStyleFields(row)[columns.name]));

  const fontFor = (lang: string, current: string) => (sharesFontFamily(lang, sourceLang) ? current : assFontFor(lang, platform));
  const restyle = (fields: string[], name: string, lang: string, size: number) => {
    const next = [...fields];
    next[columns.name] = name;
    next[columns.font] = fontFor(lang, fields[columns.font]);
    next[columns.size] = String(size);
    return `Style: ${next.join(",")}`;
  };

  const secondaryLines: string[] = [];
  let insertAt = stylesIdx + 1;
  for (let i = stylesIdx + 1; i < sectionEnd; i++) {
    if (!STYLE_ROW_PATTERN.test(lines[i].trim())) continue;
    insertAt = i + 1;
    if (!/^Style:/i.test(lines[i].trim())) continue;
    const fields = splitStyleFields(lines[i]);
    const name = fields[columns.name];
    if (!usedStyles.includes(name)) continue;
    const primarySize = scaledPrimarySize(Number(fields[columns.size]) || 0, sizing);
    const secondaryName = secondaryStyleName(name, secondaryLang);
    if (bilingual && !definedStyles.has(secondaryName)) {
      secondaryLines.push(restyle(fields, secondaryName, secondaryLang, scaledSecondarySize(primarySize, equalSize, sizing)));
    }
    lines[i] = restyle(fields, name, primaryLang, primarySize);
  }
  lines.splice(insertAt, 0, ...secondaryLines);

  return lines.join("\n");
}

export interface AssHeaderOptions {
  bilingual: boolean;
  fonts: AssFontPlan;
  secondaryLang: string;
  stampComment: boolean;
  styleAlignments?: StyleAlignments;
}

const DEFAULT_ALIGNMENT = 2;

function styleRow(name: string, font: string, size: number, alignment: number = DEFAULT_ALIGNMENT): string {
  return `Style: ${name},${font},${size},&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,1,${alignment},60,60,45,1`;
}

export function buildAssHeader(options: AssHeaderOptions): string {
  const { bilingual, fonts, secondaryLang, stampComment, styleAlignments } = options;
  const lines = [
    "[Script Info]",
    ...(stampComment ? [`; Translated and generated by Montage Subtitle Translator v${__APP_VERSION__} (${SITE_URL})`] : []),
    "Title: ",
    "ScriptType: v4.00+",
    `PlayResX: ${ASS_PLAY_RESOLUTION.width}`,
    `PlayResY: ${ASS_PLAY_RESOLUTION.height}`,
    "PlayDepth: 0",
    "ScaledBorderAndShadow: Yes",
    "",
    "[V4+ Styles]",
    `Format: ${STYLE_FORMAT_FIELDS.join(", ")}`,
    styleRow(DEFAULT_ASS_STYLE, fonts.primaryFont, fonts.primarySize, styleAlignments?.primary),
    ...(bilingual ? [styleRow(secondaryStyleName(DEFAULT_ASS_STYLE, secondaryLang), fonts.secondaryFont, fonts.secondarySize, styleAlignments?.secondary)] : []),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  return lines.join("\n");
}
