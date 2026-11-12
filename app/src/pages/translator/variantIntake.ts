import type { CollectResult, RawSource } from "../../lib/subtitle/archive";
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
  chooseVariants(groups: VariantGroup[]): Promise<VariantChoiceResult | null>;
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

async function scanMatroska(file: File, relativePath: string, context: IntakeContext): Promise<MatroskaOutcome | null> {
  const controller = new AbortController();
  const stopOnLifecycle = (): void => controller.abort();
  context.lifecycle.addEventListener("abort", stopOnLifecycle, { once: true });
  const row = context.scanRows.begin(relativePath, () => controller.abort());
  try {
    return await readMatroskaGroup(file, relativePath, { onProgress: row.setFraction, signal: controller.signal });
  } catch (error) {
    if (isAbort(error)) return null;
    return { kind: "rejected", reason: "unreadable" };
  } finally {
    context.lifecycle.removeEventListener("abort", stopOnLifecycle);
    row.end();
  }
}

export async function resolveVariantSources(collected: CollectResult, context: IntakeContext): Promise<CollectResult> {
  const groups: VariantGroup[] = [];
  const sources: RawSource[] = [];
  const rejectedInputs = [...collected.rejectedInputs];

  for (const source of collected.sources) {
    const group = await bilingualGroupOf(source);
    if (group) groups.push(group);
    else sources.push(source);
  }
  for (const { file, relativePath } of collected.matroskaFiles) {
    const outcome = await scanMatroska(file, relativePath, context);
    if (outcome?.kind === "group") groups.push(outcome.group);
    else if (outcome) rejectedInputs.push({ name: relativePath, reason: outcome.reason });
  }

  const order = context.languageOrder();
  const undecided = groups.filter(needsChoice);
  const picks = undecided.length ? await context.chooseVariants(undecided) : new Map<string, string>();
  for (const group of groups) {
    if (!needsChoice(group)) {
      sources.push(sourceFromVariant(group, resolveKey(group, defaultKeyOf(group, order), order)));
      continue;
    }
    const variant = group.variants.find(({ id }) => id === picks?.get(group.id));
    if (variant) sources.push(sourceFromVariant(group, variant));
  }
  return { sources, rejectedInputs, matroskaFiles: [] };
}
