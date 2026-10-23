import { BilingualStacking, Cue, CueLayout, OutputMode, SubtitleFormat } from '../types';
import { AnCornerOrDefault, resolveTopAlign, TopAlign, topAlignOf } from './topAlign';

export type SplitBand = "top" | "bottom";

export interface LayoutInfo {
  cueLayout: CueLayout;
  mode: OutputMode;
  stacking: BilingualStacking;
}

export interface PositionRule {
  defaultAn: AnCornerOrDefault;
  allowed: readonly AnCornerOrDefault[] | null;
}

export const SINGLE_POSITION_RULE: PositionRule = { defaultAn: 2, allowed: null };

const BAND_CELLS: Record<SplitBand, readonly AnCornerOrDefault[]> = { top: [7, 8, 9], bottom: [1, 2, 3] };

const MIDDLE_CELLS: readonly AnCornerOrDefault[] = [4, 5, 6];

const BAND_CENTER: Record<SplitBand, AnCornerOrDefault> = { top: 8, bottom: 2 };
const OPPOSITE_BAND: Record<SplitBand, SplitBand> = { top: "bottom", bottom: "top" };

export function effectiveCueLayout(format: SubtitleFormat, cueLayout: CueLayout | undefined): CueLayout {
  return format === "srt" ? "single" : cueLayout ?? "single";
}

export function isSplitLayout({ cueLayout, mode }: Pick<LayoutInfo, "cueLayout" | "mode">): boolean {
  return cueLayout === "split" && mode === "bilingual";
}

const translationBand = (stacking: BilingualStacking): SplitBand => (stacking === "translation_top" ? "top" : "bottom");

const translationCells = (band: SplitBand): readonly AnCornerOrDefault[] => [...BAND_CELLS[band], ...MIDDLE_CELLS];

export function splitTranslationAn(stacking: BilingualStacking, override?: AnCornerOrDefault): AnCornerOrDefault {
  const band = translationBand(stacking);
  return override !== undefined && translationCells(band).includes(override) ? override : BAND_CENTER[band];
}

export function splitBlockAns(stacking: BilingualStacking, override?: AnCornerOrDefault): Record<SplitBand, AnCornerOrDefault> {
  const translation = splitTranslationAn(stacking, override);
  const original = BAND_CENTER[OPPOSITE_BAND[translationBand(stacking)]];
  return stacking === "original_top" ? { top: original, bottom: translation } : { top: translation, bottom: original };
}

export function positionRule(info: LayoutInfo): PositionRule {
  if (!isSplitLayout(info)) return SINGLE_POSITION_RULE;
  const band = translationBand(info.stacking);
  return { defaultAn: BAND_CENTER[band], allowed: translationCells(band) };
}

export function resolveCuePlacement(
  info: LayoutInfo, original: Pick<Cue, "topAlign"> | undefined, isMusic: boolean | undefined, musicTopAlign: boolean, override?: AnCornerOrDefault
): TopAlign | undefined {
  if (isSplitLayout(info)) return topAlignOf(splitTranslationAn(info.stacking, override));
  return resolveTopAlign(original, isMusic, musicTopAlign, override);
}
