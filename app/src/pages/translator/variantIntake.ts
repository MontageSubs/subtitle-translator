import type { CollectResult, PendingMatroska, RawSource, RejectedInput } from "../../lib/subtitle/archive";
import { PauseGate } from "../../lib/subtitle/container/matroska/pauseGate";
import type { MatroskaOutcome } from "../../lib/subtitle/variants/matroskaGroup";
import { defaultKeyOf, needsChoice, resolveKey } from "../../lib/subtitle/variants/selection";
import { bilingualGroupOf } from "../../lib/subtitle/variants/sourceGroup";
import type { SubtitleVariant, VariantGroup } from "../../lib/subtitle/variants/types";
import type { VariantChoiceResult } from "../../components/variantChoice";
import type { ScanRowsHandle } from "./scanRows";

export interface IntakeContext {
  scanRows: ScanRowsHandle;
  lifecycle: AbortSignal;
  languageOrder(): string[];
  targetLanguage(): string;
  addProvisional(group: VariantGroup, variant: SubtitleVariant): Promise<string | null>;
  isQueued(fileId: string): boolean;
  applyChoice(fileId: string, group: VariantGroup, variant: SubtitleVariant): void;
  dropProvisional(fileId: string): void;
  markUnsettled(fileId: string): void;
  chooseVariants(groups: VariantGroup[]): Promise<VariantChoiceResult | null>;
}

export interface IntakeResult {
  sources: RawSource[];
  rejectedInputs: RejectedInput[];
  discarded: VariantGroup[];
}

type ScanOutcome = MatroskaOutcome | { kind: "skipped" } | { kind: "rejected"; reason: "videoUnreadable" };

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

async function scanMatroska(pending: PendingMatroska, position: { index: number; total: number }, context: IntakeContext, batch: AbortController): Promise<ScanOutcome> {
  const controller = new AbortController();
  const pause = new PauseGate();
  const abortFile = (): void => controller.abort();
  batch.signal.addEventListener("abort", abortFile, { once: true });
  const row = context.scanRows.begin(pending.relativePath, {
    position,
    onSkip: abortFile,
    onCancel: () => batch.abort(),
    onPausedChange: (paused) => pause.set(paused),
  });
  try {
    const { readMatroskaGroup } = await import("../../lib/subtitle/variants/matroskaGroup");
    return await readMatroskaGroup(pending.file, pending.relativePath, { onProgress: row.setFraction, signal: controller.signal, pause });
  } catch (error) {
    if (isAbort(error)) return { kind: "skipped" };
    console.warn(`[subtitle-translator] Reading "${pending.relativePath}" failed`, error);
    return { kind: "rejected", reason: "videoUnreadable" };
  } finally {
    batch.signal.removeEventListener("abort", abortFile);
    row.end();
  }
}

async function groupOfPlainSource(source: RawSource): Promise<VariantGroup | null> {
  try {
    return await bilingualGroupOf(source);
  } catch (error) {
    console.warn(`[subtitle-translator] Bilingual analysis of "${source.relativePath}" failed`, error);
    return null;
  }
}

export async function resolveVariantSources(collected: CollectResult, context: IntakeContext): Promise<IntakeResult> {
  const sources: RawSource[] = [];
  const rejectedInputs: RejectedInput[] = [...collected.rejectedInputs];
  const order = context.languageOrder();
  const avoid = context.targetLanguage();
  const queuedFileOf = new Map<VariantGroup, string>();

  const admit = async (group: VariantGroup): Promise<void> => {
    const fileId = await context.addProvisional(group, resolveKey(group, defaultKeyOf(group, order, avoid), order, avoid));
    if (!fileId) return;
    queuedFileOf.set(group, fileId);
    if (needsChoice(group)) context.markUnsettled(fileId);
  };

  for (const source of collected.sources) {
    const group = await groupOfPlainSource(source);
    if (group) await admit(group);
    else sources.push(source);
  }

  const batch = new AbortController();
  const stopOnLifecycle = (): void => batch.abort();
  context.lifecycle.addEventListener("abort", stopOnLifecycle, { once: true });
  const total = collected.matroskaFiles.length;
  try {
    for (const [offset, pending] of collected.matroskaFiles.entries()) {
      if (batch.signal.aborted) break;
      const outcome = await scanMatroska(pending, { index: offset + 1, total }, context, batch);
      if (outcome.kind === "group") await admit(outcome.group);
      else if (outcome.kind === "rejected") rejectedInputs.push({ name: pending.relativePath, reason: outcome.reason, ...(outcome.reason === "videoUnreadable" ? { retry: pending } : {}) });
    }
  } finally {
    context.lifecycle.removeEventListener("abort", stopOnLifecycle);
  }

  const undecided = [...queuedFileOf].filter(([group, fileId]) => needsChoice(group) && context.isQueued(fileId)).map(([group]) => group);
  const discarded: VariantGroup[] = [];
  if (undecided.length) {
    const picks = await context.chooseVariants(undecided);
    for (const group of undecided) {
      const fileId = queuedFileOf.get(group)!;
      if (!context.isQueued(fileId)) continue;
      if (picks === null) {
        context.dropProvisional(fileId);
        discarded.push(group);
        continue;
      }
      const variant = group.variants.find(({ id }) => id === picks.get(group.id));
      if (variant) context.applyChoice(fileId, group, variant);
    }
  }
  return { sources, rejectedInputs, discarded };
}
