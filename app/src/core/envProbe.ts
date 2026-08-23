const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const MIX_PRIME = 0x1000193;
const WORKER_ROUNDTRIP_TIMEOUT_MS = 3_000;
const CLONE_VARIANT_STD = "std";
const CLONE_VARIANT_PLAIN = "plain";

const WORKER_SOURCE = `self.onmessage=async(e)=>{
  const {x2,tag,variant}=e.data;
  const enc=new TextEncoder().encode(\`\${x2}:\${tag}:\${variant}:\${typeof window==="undefined"}\`);
  const digest=await crypto.subtle.digest("SHA-256",enc);
  self.postMessage(new DataView(digest).getUint32(0));
};`;

export interface ProofVector {
  length: number;
  tag: string;
  variant: string;
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

async function digestUint32(data: Uint8Array): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new DataView(digest).getUint32(0);
}

function cloneSeed(seed: { v: number; tag: string }): { cloned: { v: number; tag: string }; variant: string } {
  if (typeof structuredClone === "function") return { cloned: structuredClone(seed), variant: CLONE_VARIANT_STD };
  return { cloned: { ...seed }, variant: CLONE_VARIANT_PLAIN };
}

function workerRoundTrip(x2: number, tag: string, variant: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "application/javascript" }));
    const worker = new Worker(url);
    const cleanup = () => { worker.terminate(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("worker attestation timed out")); }, WORKER_ROUNDTRIP_TIMEOUT_MS);
    worker.onmessage = (e) => { clearTimeout(timer); cleanup(); resolve(e.data as number); };
    worker.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error("worker attestation failed")); };
    worker.postMessage({ x2, tag, variant });
  });
}

export async function computeProofVector(nonce: number): Promise<ProofVector> {
  const { length, tag } = deriveRecipe(nonce);
  const x1 = await digestUint32(buildSeedBuffer(nonce, length));
  const { cloned, variant } = cloneSeed({ v: x1, tag });
  const x2 = (cloned.v ^ (cloned.tag.length * MIX_PRIME)) >>> 0;
  const commitment = await workerRoundTrip(x2, tag, variant);
  return { length, tag, variant, commitment };
}
