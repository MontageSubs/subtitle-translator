import type { IntakeItem, IntakeStream, PendingMatroska, RawSource, RejectedInput } from "../../lib/subtitle/archive";
import { PauseGate } from "../../lib/subtitle/container/matroska/pauseGate";
import type { MatroskaOutcome } from "../../lib/subtitle/variants/matroskaGroup";
import { defaultKeyOf, LanguagePreference, needsChoice, resolveKey } from "../../lib/subtitle/variants/selection";
import { bilingualGroupOf } from "../../lib/subtitle/variants/sourceGroup";
import type { SubtitleVariant, VariantGroup } from "../../lib/subtitle/variants/types";
import { sourceFromVariant } from "../../lib/subtitle/variants/variantSource";
import type { VariantChoiceResult } from "../../components/variantChoice";
import type { ScanRowsHandle } from "./scanRows";

export interface IntakeContext {
  scanRows: ScanRowsHandle;
  lifecycle: AbortSignal;
  languagePreference(): LanguagePreference;
  targetLanguage(): string;
  slotsRemaining(): number;
  addSource(source: RawSource): Promise<string | null>;
  flushAdded(): Promise<void>;
  isQueued(fileId: string): boolean;
  applyChoice(fileId: string, group: VariantGroup, variant: SubtitleVariant): void;
  dropProvisional(fileId: string): void;
  markUnsettled(fileId: string): void;
  chooseVariants(groups: VariantGroup[]): Promise<VariantChoiceResult | null>;
}

export interface IntakeResult {
  rejectedInputs: RejectedInput[];
  discarded: VariantGroup[];
  limitReached: boolean;
}

const MAX_INTAKE_ENTRIES = 100;

export interface ScanPosition {
  index: number;
  batch: boolean;
}

type ScanOutcome = MatroskaOutcome | { kind: "skipped" } | { kind: "rejected"; reason: "videoUnreadable" };

const loadMatroskaReader = (): Promise<typeof import("../../lib/subtitle/variants/matroskaGroup")> => import("../../lib/subtitle/variants/matroskaGroup");

export const warmMatroskaReader = (): void => void loadMatroskaReader();

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

async function scanMatroska(pending: PendingMatroska, position: ScanPosition, context: IntakeContext, batch: AbortController): Promise<ScanOutcome> {
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
    const { readMatroskaGroup } = await loadMatroskaReader();
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

async function loadSource(item: Extract<IntakeItem, { kind: "source" }>): Promise<RawSource | RejectedInput> {
  try {
    return await item.load();
  } catch (error) {
    console.warn(`[subtitle-translator] Reading "${item.relativePath}" failed`, error);
    return { name: item.relativePath, reason: "unreadable" };
  }
}

function peekable(stream: IntakeStream) {
  let buffered: Promise<IteratorResult<IntakeItem, void>> | null = null;
  return {
    next(): Promise<IteratorResult<IntakeItem, void>> {
      const step = buffered ?? stream.next();
      buffered = null;
      return step;
    },
    async hasNext(): Promise<boolean> {
      buffered ??= stream.next();
      return !(await buffered).done;
    },
    return: (): Promise<unknown> => stream.return(),
  };
}

export async function resolveVariantSources(stream: IntakeStream, context: IntakeContext): Promise<IntakeResult> {
  const rejectedInputs: RejectedInput[] = [];
  const preference = context.languagePreference();
  const avoid = context.targetLanguage();
  const queuedFileOf = new Map<VariantGroup, string>();

  const admit = async (group: VariantGroup): Promise<void> => {
    const variant = resolveKey(group, defaultKeyOf(group, preference, avoid), preference, avoid);
    const fileId = await context.addSource(sourceFromVariant(group, variant));
    if (!fileId) return;
    queuedFileOf.set(group, fileId);
    if (needsChoice(group)) context.markUnsettled(fileId);
  };

  const batch = new AbortController();
  const stopOnLifecycle = (): void => batch.abort();
  context.lifecycle.addEventListener("abort", stopOnLifecycle, { once: true });
  const items = peekable(stream);
  let limitReached = false;
  let examined = 0;
  let scanned = 0;
  try {
    while (!batch.signal.aborted) {
      if (context.slotsRemaining() <= 0 || examined >= MAX_INTAKE_ENTRIES) {
        limitReached = await items.hasNext();
        break;
      }
      const step = await items.next();
      if (step.done) break;
      examined += 1;
      const item = step.value;
      if (item.kind === "rejected") {
        rejectedInputs.push(item.input);
      } else if (item.kind === "source") {
        const loaded = await loadSource(item);
        if (!("bytes" in loaded)) {
          rejectedInputs.push(loaded);
          continue;
        }
        const group = await groupOfPlainSource(loaded);
        if (group) await admit(group);
        else await context.addSource(loaded);
      } else {
        await context.flushAdded();
        scanned += 1;
        const outcome = await scanMatroska(item.pending, { index: scanned, batch: scanned > 1 || (await items.hasNext()) }, context, batch);
        if (outcome.kind === "group") await admit(outcome.group);
        else if (outcome.kind === "rejected") rejectedInputs.push({ name: item.pending.relativePath, reason: outcome.reason, ...(outcome.reason === "videoUnreadable" ? { retry: item.pending } : {}) });
      }
    }
  } finally {
    context.lifecycle.removeEventListener("abort", stopOnLifecycle);
    await items.return();
  }
  await context.flushAdded();

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
  return { rejectedInputs, discarded, limitReached };
}
