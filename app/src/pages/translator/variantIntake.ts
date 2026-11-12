import type { CollectResult, PendingMatroska, RawSource, RejectedInput } from "../../lib/subtitle/archive";
import { PauseGate } from "../../lib/subtitle/container/matroska/pauseGate";
import { MatroskaOutcome, readMatroskaGroup } from "../../lib/subtitle/variants/matroskaGroup";
import { defaultKeyOf, needsChoice, resolveKey } from "../../lib/subtitle/variants/selection";
import { bilingualGroupOf } from "../../lib/subtitle/variants/sourceGroup";
import type { VariantGroup } from "../../lib/subtitle/variants/types";
import { sourceFromVariant } from "../../lib/subtitle/variants/variantSource";
import type { VariantChoiceResult } from "../../components/variantChoice";
import type { ScanRowsHandle } from "./scanRows";

export interface IntakeContext {
  scanRows: ScanRowsHandle;
  lifecycle: AbortSignal;
  languageOrder(): string[];
  targetLanguage(): string;
  chooseVariants(groups: VariantGroup[]): Promise<VariantChoiceResult | null>;
}

export interface IntakeResult extends CollectResult {
  discarded: VariantGroup[];
}

type ScanOutcome = MatroskaOutcome | { kind: "cancelled" } | { kind: "rejected"; reason: "videoUnreadable" };

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

async function scanMatroska(pending: PendingMatroska, position: { index: number; total: number }, context: IntakeContext): Promise<ScanOutcome> {
  const controller = new AbortController();
  const pause = new PauseGate();
  const stopOnLifecycle = (): void => controller.abort();
  context.lifecycle.addEventListener("abort", stopOnLifecycle, { once: true });
  const row = context.scanRows.begin(pending.relativePath, { position, onCancel: () => controller.abort(), onPausedChange: (paused) => pause.set(paused) });
  try {
    return await readMatroskaGroup(pending.file, pending.relativePath, { onProgress: row.setFraction, signal: controller.signal, pause });
  } catch (error) {
    if (isAbort(error)) return { kind: "cancelled" };
    console.warn(`[subtitle-translator] Reading "${pending.relativePath}" failed`, error);
    return { kind: "rejected", reason: "videoUnreadable" };
  } finally {
    context.lifecycle.removeEventListener("abort", stopOnLifecycle);
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
  const groups: VariantGroup[] = [];
  const sources: RawSource[] = [];
  const rejectedInputs: RejectedInput[] = [...collected.rejectedInputs];

  for (const source of collected.sources) {
    const group = await groupOfPlainSource(source);
    if (group) groups.push(group);
    else sources.push(source);
  }
  const total = collected.matroskaFiles.length;
  for (const [offset, pending] of collected.matroskaFiles.entries()) {
    const outcome = await scanMatroska(pending, { index: offset + 1, total }, context);
    if (outcome.kind === "group") groups.push(outcome.group);
    else if (outcome.kind === "rejected") rejectedInputs.push({ name: pending.relativePath, reason: outcome.reason, ...(outcome.reason === "videoUnreadable" ? { retry: pending } : {}) });
  }

  const order = context.languageOrder();
  const avoid = context.targetLanguage();
  const undecided = groups.filter(needsChoice);
  const picks = undecided.length ? await context.chooseVariants(undecided) : new Map<string, string>();
  const discarded: VariantGroup[] = [];
  for (const group of groups) {
    if (!needsChoice(group)) sources.push(sourceFromVariant(group, group.variants[0]));
    else if (picks === null) discarded.push(group);
    else {
      const variant = group.variants.find(({ id }) => id === picks.get(group.id)) ?? resolveKey(group, defaultKeyOf(group, order, avoid), order, avoid);
      sources.push(sourceFromVariant(group, variant));
    }
  }
  return { sources, rejectedInputs, matroskaFiles: [], discarded };
}
