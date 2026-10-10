import type { BilingualCue, Cue, Unit } from "../types";
import { evaluateReadingSpeed } from "../common/lineMetrics";
import { readingProfileFor, type ReadingProfile } from "../common/readingProfiles";
import type { SourceRules, TargetRules } from "../languages/types";
import { sourceRulesFor, targetRulesFor } from "../languages/registry";
import { stripForeignMarkers } from "../markers";
import { computeCueMusicFlags, formatMusicLine } from "./music";
import { applyDashStyle, determineDashStyle, normalizeExclaimQuestion, normalizeTranslation, stripUnsourcedBrackets } from "./normalize";
import { findProtectedSpans } from "./protectedSpans";
import { rectifyTranslationQuotes } from "./quotes";
import { splitTranslation } from "./translationSplit";
import type { ApproxSplit, MergeResult, ProtectedSpan, QualityWarning, SplitContext, SplitMethod } from "./types";

const APPROX_SPLIT_SAFE_METHODS: ReadonlySet<SplitMethod> = new Set([
  "single", "original_boundary", "inferred_punctuation", "marker_boundary", "mixed_boundary",
]);
const LEADING_DASH_PATTERN = /^[- ]+/;

interface CueState {
  translation: string | null;
  warning?: QualityWarning;
}

export class BilingualMerger {
  private readonly unitById = new Map<number, Unit>();
  private readonly cueById = new Map<number, Cue>();
  private readonly expectedSegments = new Map<number, number>();
  private readonly segments = new Map<number, Map<number, string>>();
  private readonly states = new Map<number, CueState>();
  private readonly received = new Map<number, string>();
  private readonly approxSplits = new Map<number, ApproxSplit>();
  private readonly dirtyCues = new Set<number>();
  private readonly glossaryTerms = new Set<string>();
  private readonly dashStyle: string;
  private readonly musicCues: Map<number, boolean>;
  private sourceRules: SourceRules;
  private anchorsEnabled: boolean;

  private constructor(
    private readonly cues: Cue[],
    private readonly units: Unit[],
    sourceLang: string | undefined,
    private readonly targetRules: TargetRules,
    private readonly readingProfile: ReadingProfile,
    private readonly cutter: SplitContext["cutter"]
  ) {
    for (const cue of cues) this.cueById.set(cue.id, cue);
    const dashIndices = new Map<number, Set<number>>();
    for (const unit of units) {
      this.unitById.set(unit.id, unit);
      for (const match of unit.term_matches) if (match.target) this.glossaryTerms.add(match.target);
      for (const span of unit.spans) {
        let set = dashIndices.get(span.id);
        if (!set) dashIndices.set(span.id, (set = new Set()));
        set.add(span.dash_index);
      }
    }
    for (const [cueId, set] of dashIndices) this.expectedSegments.set(cueId, set.size);
    this.dashStyle = determineDashStyle(cues);
    this.musicCues = computeCueMusicFlags(units);
    this.sourceRules = sourceRulesFor(sourceLang);
    this.anchorsEnabled = this.computeAnchorsEnabled();
  }

  static async create(cues: Cue[], units: Unit[], sourceLang: string | undefined, targetLang: string): Promise<BilingualMerger> {
    const rules = targetRulesFor(targetLang);
    const cutter = rules.loadWordCutter ? await rules.loadWordCutter() : null;
    return new BilingualMerger(cues, units, sourceLang, rules, readingProfileFor(targetLang), cutter);
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
    for (const cueId of this.dirtyCues) {
      const cue = this.toBilingual(this.cueById.get(cueId)!);
      if (cue.translation !== null) updated.push(cue);
    }
    this.dirtyCues.clear();
    return updated;
  }

  snapshot(onLog?: (message: string) => void): MergeResult {
    const cues = this.cues.map((cue) => this.toBilingual(cue));
    const approxSplits = this.units.flatMap((unit) => this.approxSplits.get(unit.id) ?? []);
    const qualityWarnings = this.cues.flatMap((cue) => this.states.get(cue.id)?.warning ?? []);
    const missingCues = cues.filter((cue) => cue.translation === null).map((cue) => cue.id);
    if (approxSplits.length) onLog?.(`recovered ${approxSplits.length} splits (lengths implausible)`);
    if (missingCues.length) onLog?.(`failed to merge ${missingCues.length} cues`);
    return {
      cues,
      approx_splits: approxSplits,
      missing_count: missingCues.length,
      missing_cues: missingCues,
      quality_warnings: qualityWarnings,
    };
  }

  private toBilingual(cue: Cue): BilingualCue {
    return { ...cue, translation: this.states.get(cue.id)?.translation ?? null, is_music: this.musicCues.get(cue.id) ?? false };
  }

  private processUnit(unit: Unit, translated: string): void {
    const spans = unit.spans;
    const originalText = spans.map((span) => span.text).join("");
    const text = rectifyTranslationQuotes(
      stripUnsourcedBrackets(originalText, stripForeignMarkers(translated)), originalText, this.targetRules.quotes
    );
    let protectedSpans: ProtectedSpan[] | undefined;
    const [parts, method] = splitTranslation(text, spans, () => (protectedSpans ??= findProtectedSpans(text, this.glossaryTerms, this.targetRules.quotes)), {
      rules: this.targetRules, anchorsEnabled: this.anchorsEnabled, cutter: this.cutter,
    });

    if (APPROX_SPLIT_SAFE_METHODS.has(method)) this.approxSplits.delete(unit.id);
    else this.approxSplits.set(unit.id, { unit_id: unit.id, cues: spans.map((span) => span.id), method });

    const affected = new Set<number>();
    spans.forEach((span, i) => {
      let part = normalizeTranslation(parts[i]!, this.targetRules);
      if (span.style_wrap && part) part = `<${span.style_wrap}>${part}</${span.style_wrap}>`;
      if (span.kind === "music" && !this.musicCues.get(span.id)) part = formatMusicLine(part);
      let bucket = this.segments.get(span.id);
      if (!bucket) this.segments.set(span.id, (bucket = new Map()));
      bucket.set(span.dash_index, part);
      affected.add(span.id);
    });
    for (const cueId of affected) this.recomputeCue(cueId);
  }

  private recomputeCue(cueId: number): void {
    this.dirtyCues.add(cueId);
    const bucket = this.segments.get(cueId);
    if (!bucket || bucket.size < this.expectedSegments.get(cueId)!) {
      this.states.set(cueId, { translation: null });
      return;
    }
    const parts = [...bucket.entries()].sort((a, b) => a[0] - b[0]).map(([, part]) => part);
    const isAllMusic = this.musicCues.get(cueId) ?? false;
    let translation: string;
    if (parts.length > 1) {
      translation = parts
        .map((part) => {
          const body = part.replace(LEADING_DASH_PATTERN, "");
          return `-${isAllMusic ? formatMusicLine(body) : body}`;
        })
        .join(" ");
    } else {
      translation = parts[0]!;
    }
    if (!translation) {
      this.states.set(cueId, { translation });
      return;
    }
    translation = normalizeExclaimQuestion(applyDashStyle(translation, this.dashStyle));
    if (isAllMusic && parts.length === 1) translation = formatMusicLine(translation);

    const cue = this.cueById.get(cueId)!;
    const { cps, overCps, overLength } = evaluateReadingSpeed(translation, cue.end_ms - cue.start_ms, this.readingProfile);
    const warning = overCps || overLength ? { cue_id: cueId, cps, over_cps: overCps, over_length: overLength } : undefined;
    this.states.set(cueId, { translation, warning });
  }
}

