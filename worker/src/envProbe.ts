const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const CLONE_VARIANTS = ["std", "plain"] as const;
const STEP_IDS = ["crypto", "clone", "worker"] as const;
type StepId = typeof STEP_IDS[number];

export interface ProofVector {
  length: number;
  tag: string;
  variant: string;
  transcript: number[];
}

function deriveRecipe(nonce: number): { length: number; tag: string } {
  return { length: BYTE_LENGTHS[nonce % BYTE_LENGTHS.length], tag: (nonce % 997).toString(36) };
}

export function deriveStepOrder(nonce: number): StepId[] {
  const pool: StepId[] = [...STEP_IDS];
  const order: StepId[] = [];
  let seed = nonce >>> 0;
  for (let remaining = pool.length; remaining > 0; remaining--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    order.push(...pool.splice(seed % remaining, 1));
  }
  return order;
}

function buildSeedBuffer(nonce: number, length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  for (let i = 0; i < length; i++) buffer[i] = (nonce ^ Math.imul(i + 1, 2654435761)) & 0xff;
  return buffer;
}

async function digestUint32(data: BufferSource): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new DataView(digest).getUint32(0);
}

async function applyStep(step: StepId, x: number, tag: string, variant: string): Promise<number> {
  const label = step === "clone" ? `clone:${variant}` : step === "worker" ? "worker:true" : "crypto";
  return digestUint32(new TextEncoder().encode(`${x}:${tag}:${label}`));
}

function isValidProofShape(value: unknown): value is ProofVector {
  if (!value || typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  return (
    Number.isInteger(proof.length) &&
    typeof proof.tag === "string" && proof.tag.length <= 8 &&
    typeof proof.variant === "string" && (CLONE_VARIANTS as readonly string[]).includes(proof.variant) &&
    Array.isArray(proof.transcript) && proof.transcript.length === STEP_IDS.length &&
    proof.transcript.every((v) => Number.isInteger(v))
  );
}

export async function verifyProofVector(nonce: number, value: unknown): Promise<boolean> {
  if (!isValidProofShape(value)) return false;
  const recipe = deriveRecipe(nonce);
  if (value.length !== recipe.length || value.tag !== recipe.tag) return false;

  const order = deriveStepOrder(nonce);
  let x = await digestUint32(buildSeedBuffer(nonce, recipe.length));
  for (let i = 0; i < order.length; i++) {
    x = await applyStep(order[i], x, recipe.tag, value.variant);
    if (x !== value.transcript[i]) return false;
  }
  return true;
}

export function proofCommitment(proof: { transcript: number[] } | undefined): number {
  return Number(proof?.transcript?.[proof.transcript.length - 1]);
}
