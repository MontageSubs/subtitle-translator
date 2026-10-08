import { Cue, TranslatedCue } from '../../types';
import { resolveTopAlign, renderVttSettings, AnCornerOrDefault, AUTO_TOP_ALIGN } from '../topAlign';
import { cleanPositionTags } from '../../postprocess/displayText';
import { wrapLine } from '../../postprocess/lineWrap';
import { msToVttTime } from '../clock';
import { CueRenderContext, cueTopAlignOverride, plainCueLines } from '../renderShared';

const DEFAULT_HEADER = "WEBVTT";
const SPLIT_BOTTOM_IDENTIFIER_SUFFIX = "-b";

function resolveVttSettings(original: Cue | undefined, isMusic: boolean | undefined, musicTopAlign: boolean, override: AnCornerOrDefault | undefined): string {
  const topAlign = resolveTopAlign(original, isMusic, musicTopAlign, override);
  if (topAlign) return renderVttSettings(topAlign);
  const preserved = original?.cueSettings?.trim();
  return preserved && !preserved.includes("|") ? ` ${preserved}` : "";
}

function renderSplitCue(cue: TranslatedCue, identifier: string, context: CueRenderContext): string[] {
  const processed = cleanPositionTags(cue.text || context.originalById.get(cue.id)?.text || "");
  const translation = wrapLine(cleanPositionTags(cue.translation || ""), context.targetLang, cue.end_ms - cue.start_ms);
  const originalOnTop = context.stacking === "original_top";
  const timing = `${msToVttTime(cue.start_ms)} --> ${msToVttTime(cue.end_ms)}`;
  const bottomSettings = resolveVttSettings(undefined, cue.is_music, context.musicTopAlign, cueTopAlignOverride(cue, context));
  const bottomIdentifier = identifier ? `${identifier}${SPLIT_BOTTOM_IDENTIFIER_SUFFIX}\n` : "";
  const topIdentifier = identifier ? `${identifier}\n` : "";
  return [
    `${topIdentifier}${timing}${renderVttSettings(AUTO_TOP_ALIGN)}\n${originalOnTop ? processed : translation}`,
    `${bottomIdentifier}${timing}${bottomSettings}\n${originalOnTop ? translation : processed}`,
  ];
}

export function renderVtt(cues: TranslatedCue[], context: CueRenderContext): string {
  if (!cues.length) return `${DEFAULT_HEADER}\n`;

  const parts: string[] = [context.originalById.get(cues[0].id)?.vttHeader || DEFAULT_HEADER];
  for (const cue of cues) {
    const original = context.originalById.get(cue.id);
    if (original?.leadingBlocks?.length) parts.push(original.leadingBlocks.join("\n\n"));

    const identifier = original?.identifier ?? "";
    if (context.cueLayout === "split" && context.mode === "bilingual" && cleanPositionTags(cue.translation || "")) {
      parts.push(...renderSplitCue(cue, identifier, context));
      continue;
    }
    const settings = resolveVttSettings(original, cue.is_music, context.musicTopAlign, cueTopAlignOverride(cue, context));
    const timing = `${msToVttTime(cue.start_ms)} --> ${msToVttTime(cue.end_ms)}${settings}`;
    parts.push(`${identifier ? `${identifier}\n` : ""}${timing}\n${plainCueLines(cue, original, context).join("\n")}`);
  }

  const trailing = context.originalById.get(cues[cues.length - 1].id)?.trailingBlocks;
  if (trailing?.length) parts.push(trailing.join("\n\n"));
  return `${parts.join("\n\n")}\n`;
}
