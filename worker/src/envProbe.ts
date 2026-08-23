const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const WORKER_CONTEXT_MARKER = "true";
const MIX_PRIME = 0x1000193;

export interface ProofVector {
  length: number;
  tag: string;
  commitment: number;
}

function deriveRecipe(nonce: number): { length: number; tag: string } {
  return { length: BYTE_LENGTHS[nonce % BYTE_LENGTHS.length], tag: (nonce % 997).toString(36) };
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

async function expectedCommitment(nonce: number, length: number, tag: string): Promise<number> {
  const x1 = await digestUint32(buildSeedBuffer(nonce, length));
  const x2 = (x1 ^ (tag.length * MIX_PRIME)) >>> 0;
  return digestUint32(new TextEncoder().encode(`${x2}:${tag}:${WORKER_CONTEXT_MARKER}`));
}

function isValidProofShape(value: unknown): value is ProofVector {
  if (!value || typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  return (
    Number.isInteger(proof.length) &&
    typeof proof.tag === "string" && proof.tag.length <= 8 &&
    Number.isInteger(proof.commitment)
  );
}

export async function verifyProofVector(nonce: number, value: unknown): Promise<boolean> {
  if (!isValidProofShape(value)) return false;
  const recipe = deriveRecipe(nonce);
  if (value.length !== recipe.length || value.tag !== recipe.tag) return false;
  return (await expectedCommitment(nonce, recipe.length, recipe.tag)) === value.commitment;
}
