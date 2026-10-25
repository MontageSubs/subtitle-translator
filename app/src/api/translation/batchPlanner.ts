import { cueSceneIndexes } from "../../lib/subtitle/common/sceneThreads";
import type { Cue } from "../../lib/subtitle/types";
import type { ModelLimits } from "./types";

export const PLANNING_RATIO = 0.6;

const CUE_SPAN_FRAME_CHARS = 23;
const SPAN_INDEX_REPEATS = 2;
const GROUP_FRAME_CHARS = 11;
const CONTEXT_FRAME_CHARS = 26;
const CUT_WINDOW_RATIO = 0.15;
const MAX_REQUEST_PARTS = 12;
const AMPERSAND_GROWTH = 4;

export interface PlanningInput {
  cues: readonly Cue[];
  sceneSeconds: number;
  limits: ModelLimits;
  maxCuesPerRequest: number;
  contextChars: number;
  contextRequests: number;
}

export interface RequestPlan<T extends Cue> {
  parts: T[][];
  estimatedBatches: number[];
  batchCapacity: number;
}

interface Analysis {
  scenes: number[];
  costs: number[];
  prefix: number[];
  groupFrame: number;
  requestChars: number;
}

export function batchCapacity(limits: ModelLimits, contextRequests: number): number {
  const planned = Math.floor(limits.subrequestLimit * PLANNING_RATIO) - contextRequests;
  return Math.max(1, Math.min(limits.initialBatchCap, planned));
}

function escapedLength(text: string): number {
  let length = text.length;
  for (let at = text.indexOf("&"); at !== -1; at = text.indexOf("&", at + 1)) length += AMPERSAND_GROWTH;
  return length;
}

function analyze(input: PlanningInput): Analysis {
  const { cues, sceneSeconds, limits, contextChars } = input;
  const spanChars = CUE_SPAN_FRAME_CHARS + SPAN_INDEX_REPEATS * String(cues.length).length;
  const costs = cues.map((cue) => spanChars + escapedLength(cue.text));
  const prefix = [0];
  for (const cost of costs) prefix.push(prefix[prefix.length - 1]! + cost);
  return {
    scenes: cueSceneIndexes(cues, sceneSeconds),
    costs,
    prefix,
    groupFrame: GROUP_FRAME_CHARS + (contextChars > 0 ? CONTEXT_FRAME_CHARS + contextChars : 0),
    requestChars: limits.requestChars,
  };
}

function groupCostsByScene(analysis: Analysis, from: number, to: number): number[][] {
  const groups = new Map<number, number[]>();
  for (let index = from; index < to; index++) {
    const scene = analysis.scenes[index]!;
    const group = groups.get(scene);
    if (group) group.push(analysis.costs[index]!);
    else groups.set(scene, [analysis.costs[index]!]);
  }
  return [...groups.values()];
}

function countOversizedGroupPieces(group: number[], frame: number, limit: number): number {
  let pieces = 0;
  let pieceCost = frame;
  let hasItems = false;
  for (const cost of group) {
    if (frame + cost > limit) continue;
    if (hasItems && pieceCost + cost > limit) {
      pieces++;
      pieceCost = frame;
      hasItems = false;
    }
    hasItems = true;
    pieceCost += cost;
  }
  return hasItems ? pieces + 1 : pieces;
}

function estimateBatches(analysis: Analysis, from: number, to: number): number {
  const { groupFrame, requestChars } = analysis;
  let batches = 0;
  let openCost = 0;
  let open = false;
  const close = () => {
    if (open) batches++;
    open = false;
    openCost = 0;
  };
  for (const group of groupCostsByScene(analysis, from, to)) {
    const groupCost = groupFrame + group.reduce((sum, cost) => sum + cost, 0);
    if (groupCost > requestChars) {
      close();
      batches += countOversizedGroupPieces(group, groupFrame, requestChars);
    } else if (openCost + groupCost > requestChars) {
      close();
      open = true;
      openCost = groupCost;
    } else {
      open = true;
      openCost += groupCost;
    }
  }
  close();
  return batches;
}

interface CutRange {
  start: number;
  end: number;
}

function lastEndWithin(analysis: Analysis, from: number, total: number, capacity: number): number {
  let low = from + 1;
  let high = total;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (estimateBatches(analysis, from, middle) <= capacity) low = middle;
    else high = middle - 1;
  }
  return low;
}

function firstStartWithin(analysis: Analysis, total: number, capacity: number): number {
  let low = 0;
  let high = total - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (estimateBatches(analysis, middle, total) <= capacity) high = middle;
    else low = middle + 1;
  }
  return low;
}

function findCut(cues: readonly Cue[], analysis: Analysis, from: number, target: number, halfWindow: number, feasible: CutRange): number {
  const { scenes, prefix } = analysis;
  const suffixMin = new Array<number>(cues.length + 1).fill(Infinity);
  for (let index = cues.length - 1; index > from; index--) suffixMin[index] = Math.min(scenes[index]!, suffixMin[index + 1]!);

  let precedingMax = scenes[from]!;
  let sceneCut = -1;
  let gapCut = -1;
  let widestGap = -1;
  let nearestFeasible = -1;
  let nearest = from + 1;
  for (let index = from + 1; index < cues.length; index++) {
    const distance = Math.abs(prefix[index]! - target);
    if (distance < Math.abs(prefix[nearest]! - target)) nearest = index;
    if (index >= feasible.start && index <= feasible.end) {
      if (nearestFeasible === -1 || distance < Math.abs(prefix[nearestFeasible]! - target)) nearestFeasible = index;
      if (suffixMin[index]! > precedingMax && (sceneCut === -1 || distance < Math.abs(prefix[sceneCut]! - target))) sceneCut = index;
      const gap = cues[index]!.start_ms - cues[index - 1]!.end_ms;
      if (distance <= halfWindow && gap > widestGap) {
        widestGap = gap;
        gapCut = index;
      }
    }
    precedingMax = Math.max(precedingMax, scenes[index]!);
  }
  if (sceneCut !== -1) return sceneCut;
  if (gapCut !== -1) return gapCut;
  return nearestFeasible !== -1 ? nearestFeasible : nearest;
}

function chooseCuts(cues: readonly Cue[], analysis: Analysis, parts: number, capacity: number): number[] {
  const total = analysis.prefix[cues.length]!;
  const halfWindow = (total / parts) * CUT_WINDOW_RATIO;
  const cuts = [0];
  for (let part = 1; part < parts; part++) {
    const from = cuts[cuts.length - 1]!;
    if (from >= cues.length - 1) break;
    const feasible = {
      start: firstStartWithin(analysis, cues.length, capacity * (parts - part)),
      end: lastEndWithin(analysis, from, cues.length, capacity),
    };
    cuts.push(findCut(cues, analysis, from, (total * part) / parts, halfWindow, feasible));
  }
  cuts.push(cues.length);
  return cuts;
}

export function planRequests<T extends Cue>(cues: readonly T[], input: Omit<PlanningInput, "cues">): RequestPlan<T> {
  const capacity = batchCapacity(input.limits, input.contextRequests);
  if (!cues.length) return { parts: [[]], estimatedBatches: [0], batchCapacity: capacity };

  const analysis = analyze({ ...input, cues });
  const wholeBatches = estimateBatches(analysis, 0, cues.length);
  const minimumParts = Math.max(1, Math.ceil(cues.length / input.maxCuesPerRequest), Math.ceil(wholeBatches / capacity));

  let best: { cuts: number[]; estimates: number[] } | null = null;
  for (let parts = minimumParts; parts <= Math.max(minimumParts, MAX_REQUEST_PARTS); parts++) {
    const cuts = parts === 1 ? [0, cues.length] : chooseCuts(cues, analysis, parts, capacity);
    const estimates = cuts.slice(1).map((end, i) => estimateBatches(analysis, cuts[i]!, end));
    best = { cuts, estimates };
    const fits = estimates.every((batches) => batches <= capacity) && cuts.slice(1).every((end, i) => end - cuts[i]! <= input.maxCuesPerRequest);
    if (fits) break;
  }

  const { cuts, estimates } = best!;
  return {
    parts: cuts.slice(1).map((end, i) => cues.slice(cuts[i], end) as T[]),
    estimatedBatches: estimates,
    batchCapacity: capacity,
  };
}
