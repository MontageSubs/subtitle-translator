const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const STEP_IDS = ["crypto", "clone", "worker"] as const;
type StepId = typeof STEP_IDS[number];
const WORKER_ROUNDTRIP_TIMEOUT_MS = 3_000;
const CLONE_VARIANT_STD = "std";
const CLONE_VARIANT_PLAIN = "plain";

const WORKER_SOURCE = `self.onmessage=async(e)=>{
  const {x,tag}=e.data;
  const enc=new TextEncoder().encode(\`\${x}:\${tag}:worker:\${typeof window==="undefined"}\`);
  const digest=await crypto.subtle.digest("SHA-256",enc);
  self.postMessage(new DataView(digest).getUint32(0));
};`;

export interface ProofVector {
  length: number;
  tag: string;
  variant: string;
  transcript: number[];
}

function deriveRecipe(nonce: number): { length: number; tag: string } {
  return { length: BYTE_LENGTHS[nonce % BYTE_LENGTHS.length], tag: (nonce % 997).toString(36) };
}

function deriveStepOrder(nonce: number): StepId[] {
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

async function digestUint32(data: Uint8Array): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new DataView(digest).getUint32(0);
}

function resolveCloneVariant(): string {
  return typeof structuredClone === "function" ? CLONE_VARIANT_STD : CLONE_VARIANT_PLAIN;
}

function applyCryptoStep(x: number, tag: string): Promise<number> {
  return digestUint32(new TextEncoder().encode(`${x}:${tag}:crypto`));
}

function applyCloneStep(x: number, tag: string, variant: string): Promise<number> {
  const cloned = variant === CLONE_VARIANT_STD ? structuredClone({ x, tag }) : { x, tag };
  return digestUint32(new TextEncoder().encode(`${cloned.x}:${cloned.tag}:clone:${variant}`));
}

function applyWorkerStep(x: number, tag: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "application/javascript" }));
    const worker = new Worker(url);
    const cleanup = () => { worker.terminate(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("worker attestation timed out")); }, WORKER_ROUNDTRIP_TIMEOUT_MS);
    worker.onmessage = (e) => { clearTimeout(timer); cleanup(); resolve(e.data as number); };
    worker.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error("worker attestation failed")); };
    worker.postMessage({ x, tag });
  });
}

export async function computeProofVector(nonce: number): Promise<ProofVector> {
  const { length, tag } = deriveRecipe(nonce);
  const variant = resolveCloneVariant();
  const order = deriveStepOrder(nonce);

  let x = await digestUint32(buildSeedBuffer(nonce, length));
  const transcript: number[] = [];
  for (const step of order) {
    x = step === "crypto" ? await applyCryptoStep(x, tag)
      : step === "clone" ? await applyCloneStep(x, tag, variant)
      : await applyWorkerStep(x, tag);
    transcript.push(x);
  }
  return { length, tag, variant, transcript };
}
