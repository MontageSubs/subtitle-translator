import { sha256Uint32 } from "../crypto";
import { CLONE_VARIANTS, STEP_IDS, type Recipe, type StepId } from "./recipe";

const DOM_MEASUREMENT_TOLERANCE = 1;
const encoder = new TextEncoder();

export interface ProofVector {
  variant: string;
  transcript: number[];
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

async function matchDomStep(x: number, tag: string, transcriptValue: number): Promise<boolean> {
  const [expectedA, expectedB] = expectedFlexWidths(x);
  const candidates: Promise<number>[] = [];
  for (let da = -DOM_MEASUREMENT_TOLERANCE; da <= DOM_MEASUREMENT_TOLERANCE; da++) {
    for (let db = -DOM_MEASUREMENT_TOLERANCE; db <= DOM_MEASUREMENT_TOLERANCE; db++) {
      candidates.push(sha256Uint32(encoder.encode(`${x}:${tag}:dom:${expectedA + da}:${expectedB + db}`)));
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
      x = reported;
      continue;
    }
    const expected = await sha256Uint32(encoder.encode(`${x}:${recipe.tag}:${stepLabel(step, value.variant)}`));
    if (expected !== reported) return false;
    x = expected;
  }
  return true;
}

export const proofCommitment = (proof: { transcript: number[] } | undefined): number => Number(proof?.transcript?.[proof.transcript.length - 1]);
