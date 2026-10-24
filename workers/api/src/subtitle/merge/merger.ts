import type { EngineTrace } from "../../logging/engineTrace";
import type { BilingualCue, Cue, Unit } from "../types";
import type { SourceRules, TargetRules, WordCutter } from "../languages/types";
import { createBoundaryFinder, type BoundaryFinder } from "./boundaries";
import { sourceRulesFor, targetRulesFor } from "../languages/registry";
import { stripForeignMarkers } from "../markers";
import { formatMusicLine } from "./music";
import { applyDashStyle, determineDashStyle, dropMarkerOnlyStylePairs, normalizeTranslation, stripUnsourcedBrackets } from "./normalize";
import { bracketProfile, hasBrackets } from "./brackets";
import { findProtectedSpans } from "./protectedSpans";
import { rectifyTranslationQuotes } from "./quotes";
import { splitTranslation } from "./translationSplit";
import type { ApproxSplit, MergeResult, ProtectedSpan, SplitMethod } from "./types";

const APPROX_SPLIT_SAFE_METHODS: ReadonlySet<SplitMethod> = new Set([
  "single", "original_boundary", "inferred_punctuation", "marker_boundary", "mixed_boundary",
]);
const LEADING_DASH_PATTERN = /^[- ]+/;

interface CueState {
  readonly cue: Cue;
  readonly parts: string[];
  expected: number;
  filled: number;
  music: boolean;
  translation: string | null;
}

export class BilingualMerger {
  private readonly unitById = new Map<number, Unit>();
  private readonly states = new Map<number, CueState>();
  private readonly received = new Map<number, string>();
  private readonly approxSplits = new Map<number, ApproxSplit>();
  private readonly dirtyCues = new Set<CueState>();
  private readonly glossaryTerms = new Set<string>();
  private readonly dashStyle: string;
  private readonly findBoundaries: BoundaryFinder;
  private sourceRules: SourceRules;
  private anchorsEnabled: boolean;

  private constructor(
    private readonly cues: Cue[],
    private readonly units: Unit[],
    sourceLang: string | undefined,
    private readonly targetRules: TargetRules,
    cutter: WordCutter | null
  ) {
    this.findBoundaries = createBoundaryFinder(cutter, targetRules.breakRule ?? null);
    const cueById = new Map(cues.map((cue) => [cue.id, cue]));
    for (const unit of units) {
      this.unitById.set(unit.id, unit);
      for (const match of unit.term_matches) if (match.target) this.glossaryTerms.add(match.target);
      for (const span of unit.spans) {
        let state = this.states.get(span.id);
        if (!state) this.states.set(span.id, (state = { cue: cueById.get(span.id)!, parts: [], expected: 0, filled: 0, music: true, translation: null }));
        state.expected++;
        state.music &&= span.kind === "music";
      }
    }
    this.dashStyle = determineDashStyle(cues);
    this.sourceRules = sourceRulesFor(sourceLang);
    this.anchorsEnabled = this.computeAnchorsEnabled();
  }

  static async create(cues: Cue[], units: Unit[], sourceLang: string | undefined, targetLang: string): Promise<BilingualMerger> {
    const rules = targetRulesFor(targetLang);
    const cutter = rules.loadWordCutter ? await rules.loadWordCutter() : null;
    return new BilingualMerger(cues, units, sourceLang, rules, cutter);
  }

  private computeAnchorsEnabled(): boolean {
    return this.targetRules.anchorsToSourcePunctuation && this.sourceRules.usesLatinPunctuation;
  }

  setSourceLang(sourceLang: string | undefined): void {
    this.sourceRules = sourceRulesFor(sourceLang);
    const enabled = this.computeAnchorsEnabled();
    if (enabled === this.anchorsEnabled) return;
    this.anchorsEnabled = enabled;
    for (const [unitId, translated] of this.received) this.processUnit(this.unitById.get(unitId)!, translated);
  }

  ingest(translations: Iterable<readonly [number, string]>): void {
    for (const [unitId, translated] of translations) {
      const unit = this.unitById.get(unitId);
      if (!unit || this.received.get(unitId) === translated) continue;
      this.received.set(unitId, translated);
      this.processUnit(unit, translated);
    }
  }

  takeUpdatedCues(): BilingualCue[] {
    const updated: BilingualCue[] = [];
    for (const state of this.dirtyCues) if (state.translation !== null) updated.push(toBilingual(state));
    this.dirtyCues.clear();
    return updated;
  }

  unemittedCues(emitted: ReadonlyMap<number, string>): BilingualCue[] {
    const pending: BilingualCue[] = [];
    for (const { id } of this.cues) {
      const state = this.states.get(id);
      if (state && state.translation !== null && emitted.get(id) !== state.translation) pending.push(toBilingual(state));
    }
    return pending;
  }

  snapshot(trace?: EngineTrace | null): MergeResult {
    const approxSplits = this.units.flatMap((unit) => this.approxSplits.get(unit.id) ?? []);
    const missingCues = this.cues.filter((cue) => this.states.get(cue.id)?.translation == null).map((cue) => cue.id);
    trace?.emit({ e: "merge", total: this.cues.length, missing: missingCues, splits: approxSplits.flatMap((split) => split.cues) });
    return { approx_splits: approxSplits, missing_count: missingCues.length, missing_cues: missingCues };
  }

  private processUnit(unit: Unit, translated: string): void {
    const spans = unit.spans;
    const originalText = spans.map((span) => span.text).join("");
    const text = rectifyTranslationQuotes(
      stripUnsourcedBrackets(originalText, stripForeignMarkers(translated)), originalText, this.targetRules.quotes
    );
    let protectedSpans: ProtectedSpan[] | undefined;
    const protect = (): ProtectedSpan[] =>
      (protectedSpans ??= findProtectedSpans(text, this.glossaryTerms, this.targetRules.quotes, hasBrackets(text) && !spans.some((span) => bracketProfile(span.text).crossing)));
    const [parts, method] = splitTranslation(text, spans, protect, {
      rules: this.targetRules, anchorsEnabled: this.anchorsEnabled,
      findBoundaries: this.findBoundaries,
    });

    if (APPROX_SPLIT_SAFE_METHODS.has(method)) this.approxSplits.delete(unit.id);
    else this.approxSplits.set(unit.id, { unit_id: unit.id, cues: spans.map((span) => span.id), method });

    const affected = new Set<CueState>();
    spans.forEach((span, i) => {
      const state = this.states.get(span.id)!;
      let part = normalizeTranslation(dropMarkerOnlyStylePairs(parts[i]!, span.text), this.targetRules.defersPunctuationStyle);
      if (span.style_wrap && part) part = `<${span.style_wrap}>${part}</${span.style_wrap}>`;
      if (span.kind === "music" && !state.music) part = formatMusicLine(part);
      if (state.parts[span.dash_index] === undefined) state.filled++;
      state.parts[span.dash_index] = part;
      affected.add(state);
    });
    for (const state of affected) this.recomputeCue(state);
  }

  private recomputeCue(state: CueState): void {
    this.dirtyCues.add(state);
    if (state.filled < state.expected) {
      state.translation = null;
      return;
    }
    const parts = state.parts.length === state.filled ? state.parts : state.parts.filter((part) => part !== undefined);
    let translation: string;
    if (parts.length > 1) {
      translation = parts
        .map((part) => {
          const body = part.replace(LEADING_DASH_PATTERN, "");
          return `-${state.music ? formatMusicLine(body) : body}`;
        })
        .join(" ");
    } else {
      translation = parts[0]!;
    }
    if (translation) {
      translation = applyDashStyle(translation, this.dashStyle);
      if (state.music && parts.length === 1) translation = formatMusicLine(translation);
    }
    state.translation = translation;
  }
}

const toBilingual = ({ cue, translation, music }: CueState): BilingualCue => ({ id: cue.id, text: cue.text, translation, is_music: music });
