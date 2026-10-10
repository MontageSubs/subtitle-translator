import { languageKey } from "./languageCodes";

export type LengthMetric = "weighted" | "plain";

export interface ReadingProfile {
  readonly cps: number;
  readonly maxCharsPerLine: number;
  readonly metric: LengthMetric;
}

const PROFILES: Readonly<Record<string, ReadingProfile>> = {
  "zh-hans": { cps: 9, maxCharsPerLine: 16, metric: "weighted" },
  "zh-hant": { cps: 9, maxCharsPerLine: 16, metric: "weighted" },
  yue: { cps: 9, maxCharsPerLine: 16, metric: "weighted" },
  ja: { cps: 4, maxCharsPerLine: 13, metric: "weighted" },
  ko: { cps: 12, maxCharsPerLine: 16, metric: "weighted" },
  en: { cps: 20, maxCharsPerLine: 42, metric: "plain" },
  hi: { cps: 22, maxCharsPerLine: 42, metric: "plain" },
  ru: { cps: 17, maxCharsPerLine: 39, metric: "plain" },
  th: { cps: 17, maxCharsPerLine: 35, metric: "plain" },
};

const DEFAULT_PROFILE: ReadingProfile = { cps: 17, maxCharsPerLine: 42, metric: "plain" };

export const readingProfileFor = (code: string | null | undefined): ReadingProfile => PROFILES[languageKey(code)] ?? DEFAULT_PROFILE;
