const WORKER_ROUNDTRIP_TIMEOUT_MS = 3_000;
const CLONE_VARIANT_STD = "std";
const CLONE_VARIANT_PLAIN = "plain";

const WORKER_SOURCE = `self.onmessage=async(e)=>{
  const {x,tag}=e.data;
  const enc=new TextEncoder().encode(\`\${x}:\${tag}:worker:\${typeof window==="undefined"}\`);
  const digest=await crypto.subtle.digest("SHA-256",enc);
  self.postMessage(new DataView(digest).getUint32(0));
};`;

export interface Recipe {
  length: number;
  tag: string;
  order: ("crypto" | "clone" | "worker" | "dom")[];
}

export interface ProofVector {
  variant: string;
  transcript: number[];
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

function domParams(x: number): { parentWidth: number; gap: number; flexA: number; flexB: number } {
  return {
    parentWidth: 220 + (x % 300),
    gap: 4 + ((x >>> 8) % 24),
    flexA: 1 + ((x >>> 16) % 5),
    flexB: 1 + ((x >>> 20) % 5),
  };
}

function measureFlexDistribution(x: number): [number, number] {
  const { parentWidth, gap, flexA, flexB } = domParams(x);
  const parent = document.createElement("div");
  parent.style.cssText = `position:absolute;visibility:hidden;top:-9999px;left:-9999px;display:flex;box-sizing:content-box;width:${parentWidth}px;gap:${gap}px;`;
  const childA = document.createElement("div");
  childA.style.cssText = `flex-grow:${flexA};flex-shrink:0;flex-basis:0;`;
  const childB = document.createElement("div");
  childB.style.cssText = `flex-grow:${flexB};flex-shrink:0;flex-basis:0;`;
  parent.appendChild(childA);
  parent.appendChild(childB);
  document.body.appendChild(parent);
  const widths: [number, number] = [Math.round(childA.getBoundingClientRect().width), Math.round(childB.getBoundingClientRect().width)];
  document.body.removeChild(parent);
  return widths;
}

async function applyDomStep(x: number, tag: string): Promise<number> {
  const [widthA, widthB] = measureFlexDistribution(x);
  return digestUint32(new TextEncoder().encode(`${x}:${tag}:dom:${widthA}:${widthB}`));
}

export async function computeProofVector(nonce: number, recipe: Recipe): Promise<ProofVector> {
  const variant = resolveCloneVariant();
  let x = await digestUint32(buildSeedBuffer(nonce, recipe.length));
  const transcript: number[] = [];
  for (const step of recipe.order) {
    x = step === "crypto" ? await applyCryptoStep(x, recipe.tag)
      : step === "clone" ? await applyCloneStep(x, recipe.tag, variant)
      : step === "dom" ? await applyDomStep(x, recipe.tag)
      : await applyWorkerStep(x, recipe.tag);
    transcript.push(x);
  }
  return { variant, transcript };
}
