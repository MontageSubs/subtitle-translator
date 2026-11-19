import { sha256Uint32 } from "./crypto";

export const STEP_IDS = ["crypto", "clone", "worker", "dom"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const CLONE_VARIANTS = ["std", "plain"] as const;

const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const MAX_TAG_LENGTH = 8;
const TAG_ENTROPY_BYTES = 4;
const RECIPE_ENTROPY_BYTES = STEP_IDS.length + TAG_ENTROPY_BYTES;
const DOM_MEASUREMENT_TOLERANCE = 1;
const encoder = new TextEncoder();

export interface Recipe {
  length: number;
  tag: string;
  order: StepId[];
}

export interface ProofVector {
  variant: string;
  transcript: number[];
}

export function generateRecipe(): Recipe {
  const entropy = crypto.getRandomValues(new Uint8Array(RECIPE_ENTROPY_BYTES));
  const order: StepId[] = [...STEP_IDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = entropy[i]! % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const tag = Array.from(entropy.subarray(STEP_IDS.length), (byte) => byte.toString(36)).join("").slice(0, 6);
  return { length: BYTE_LENGTHS[entropy[0]! % BYTE_LENGTHS.length]!, tag, order };
}

export function isValidRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Record<string, unknown>;
  const order = recipe.order;
  return (
    (BYTE_LENGTHS as readonly number[]).includes(recipe.length as number) &&
    typeof recipe.tag === "string" && recipe.tag.length > 0 && recipe.tag.length <= MAX_TAG_LENGTH &&
    Array.isArray(order) && order.length === STEP_IDS.length && STEP_IDS.every((id) => order.includes(id))
  );
}

function seedBuffer(nonce: number, length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i++) buffer[i] = (nonce ^ Math.imul(i + 1, 2654435761)) & 0xff;
  return buffer;
}

function expectedFlexWidths(x: number): [number, number] {
  const parentWidth = 220 + (x % 300);
  const gap = 4 + ((x >>> 8) % 24);
  const flexA = 1 + ((x >>> 16) % 5);
  const flexB = 1 + ((x >>> 20) % 5);
  const distributable = parentWidth - gap;
  const widthA = Math.round((distributable * flexA) / (flexA + flexB));
  return [widthA, distributable - widthA];
}

const domDigest = (x: number, tag: string, widthA: number, widthB: number): Promise<number> =>
  sha256Uint32(encoder.encode(`${x}:${tag}:dom:${widthA}:${widthB}`));

async function matchDomStep(x: number, tag: string, transcriptValue: number): Promise<boolean> {
  const [expectedA, expectedB] = expectedFlexWidths(x);
  if ((await domDigest(x, tag, expectedA, expectedB)) === transcriptValue) return true;
  const candidates: Promise<number>[] = [];
  for (let da = -DOM_MEASUREMENT_TOLERANCE; da <= DOM_MEASUREMENT_TOLERANCE; da++) {
    for (let db = -DOM_MEASUREMENT_TOLERANCE; db <= DOM_MEASUREMENT_TOLERANCE; db++) {
      if (da !== 0 || db !== 0) candidates.push(domDigest(x, tag, expectedA + da, expectedB + db));
    }
  }
  return (await Promise.all(candidates)).includes(transcriptValue);
}

function stepLabel(step: Exclude<StepId, "dom">, variant: string): string {
  return step === "clone" ? `clone:${variant}` : step === "worker" ? "worker:true" : "crypto";
}

function isValidProofShape(value: unknown): value is ProofVector {
  if (!value || typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  return (
    typeof proof.variant === "string" && (CLONE_VARIANTS as readonly string[]).includes(proof.variant) &&
    Array.isArray(proof.transcript) && proof.transcript.length === STEP_IDS.length &&
    proof.transcript.every((entry) => Number.isInteger(entry))
  );
}

export async function verifyProofVector(nonce: number, recipe: Recipe, value: unknown): Promise<boolean> {
  if (!isValidProofShape(value)) return false;
  let x = await sha256Uint32(seedBuffer(nonce, recipe.length));
  for (let i = 0; i < recipe.order.length; i++) {
    const step = recipe.order[i]!;
    const reported = value.transcript[i]!;
    if (step === "dom") {
      if (!(await matchDomStep(x, recipe.tag, reported))) return false;
    } else if ((await sha256Uint32(encoder.encode(`${x}:${recipe.tag}:${stepLabel(step, value.variant)}`))) !== reported) {
      return false;
    }
    x = reported;
  }
  return true;
}

export const proofCommitment = (proof: { transcript: number[] } | undefined): number => Number(proof?.transcript?.[proof.transcript.length - 1]);
