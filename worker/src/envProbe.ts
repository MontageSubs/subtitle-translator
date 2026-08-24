const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const CLONE_VARIANTS = ["std", "plain"] as const;
const STEP_IDS = ["crypto", "clone", "worker", "dom"] as const;
type StepId = typeof STEP_IDS[number];

export interface Recipe {
  length: number;
  tag: string;
  order: StepId[];
}

export interface ProofVector {
  variant: string;
  transcript: number[];
}

function randomIndex(bound: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % bound;
}

function randomTag(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36)).join("").slice(0, 6);
}

export function generateRecipe(): Recipe {
  const length = BYTE_LENGTHS[randomIndex(BYTE_LENGTHS.length)];
  const tag = randomTag();
  const pool: StepId[] = [...STEP_IDS];
  const order: StepId[] = [];
  while (pool.length > 0) order.push(...pool.splice(randomIndex(pool.length), 1));
  return { length, tag, order };
}

export function isValidRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Record<string, unknown>;
  return (
    (BYTE_LENGTHS as readonly number[]).includes(recipe.length as number) &&
    typeof recipe.tag === "string" && recipe.tag.length > 0 && recipe.tag.length <= 8 &&
    Array.isArray(recipe.order) && recipe.order.length === STEP_IDS.length &&
    (STEP_IDS as readonly string[]).every((id) => (recipe.order as string[]).includes(id))
  );
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

function expectedFlexWidths(x: number): [number, number] {
  const parentWidth = 220 + (x % 300);
  const gap = 4 + ((x >>> 8) % 24);
  const flexA = 1 + ((x >>> 16) % 5);
  const flexB = 1 + ((x >>> 20) % 5);
  const distributable = parentWidth - gap;
  const widthA = Math.round((distributable * flexA) / (flexA + flexB));
  const widthB = distributable - widthA;
  return [widthA, widthB];
}

const DOM_MEASUREMENT_TOLERANCE = 1;

async function matchDomStep(x: number, tag: string, transcriptValue: number): Promise<number | null> {
  const [expectedA, expectedB] = expectedFlexWidths(x);
  for (let da = -DOM_MEASUREMENT_TOLERANCE; da <= DOM_MEASUREMENT_TOLERANCE; da++) {
    for (let db = -DOM_MEASUREMENT_TOLERANCE; db <= DOM_MEASUREMENT_TOLERANCE; db++) {
      const candidate = await digestUint32(new TextEncoder().encode(`${x}:${tag}:dom:${expectedA + da}:${expectedB + db}`));
      if (candidate === transcriptValue) return candidate;
    }
  }
  return null;
}

async function applyStep(step: StepId, x: number, tag: string, variant: string): Promise<number> {
  const label = step === "clone" ? `clone:${variant}` : step === "worker" ? "worker:true" : "crypto";
  return digestUint32(new TextEncoder().encode(`${x}:${tag}:${label}`));
}

function isValidProofShape(value: unknown): value is ProofVector {
  if (!value || typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  return (
    typeof proof.variant === "string" && (CLONE_VARIANTS as readonly string[]).includes(proof.variant) &&
    Array.isArray(proof.transcript) && proof.transcript.length === STEP_IDS.length &&
    proof.transcript.every((v) => Number.isInteger(v))
  );
}

export async function verifyProofVector(nonce: number, recipe: Recipe, value: unknown): Promise<boolean> {
  if (!isValidProofShape(value)) return false;
  let x = await digestUint32(buildSeedBuffer(nonce, recipe.length));
  for (let i = 0; i < recipe.order.length; i++) {
    const step = recipe.order[i];
    if (step === "dom") {
      const matched = await matchDomStep(x, recipe.tag, value.transcript[i]);
      if (matched === null) return false;
      x = matched;
      continue;
    }
    const expectedX = await applyStep(step, x, recipe.tag, value.variant);
    if (expectedX !== value.transcript[i]) return false;
    x = expectedX;
  }
  return true;
}

export function proofCommitment(proof: { transcript: number[] } | undefined): number {
  return Number(proof?.transcript?.[proof.transcript.length - 1]);
}
