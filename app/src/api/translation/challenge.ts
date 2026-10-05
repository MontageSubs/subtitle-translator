import { Cue } from "../../utils/types";
import { decodeBase64Url } from "./tokens";

const CUE_TEXT_SEPARATOR = "\u0000";
const COMPONENT_SEPARATOR = "\u0002";
const GLOSSARY_KV_SEPARATOR = "\u0000";
const GLOSSARY_ENTRY_SEPARATOR = "\u0001";

async function signChallenge(challengeKey: string, message: string): Promise<number> {
  const key = await crypto.subtle.importKey("raw", decodeBase64Url(challengeKey) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new DataView(signature).getUint32(0);
}

export function computeAnswer(challengeKey: string, nonce: number, text: string, proofCommitment: number): Promise<number> {
  return signChallenge(challengeKey, `${nonce}:${proofCommitment}:${text}`);
}

function canonicalizeGlossary(glossary: Record<string, string>): string {
  return Object.entries(glossary)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([term, translation]) => `${term}${GLOSSARY_KV_SEPARATOR}${translation}`)
    .join(GLOSSARY_ENTRY_SEPARATOR);
}

export function computeRequestDigest(source: string, target: string, glossary: Record<string, string>, cues: Pick<Cue, "text">[]): string {
  const cueText = cues.map((cue) => cue.text).join(CUE_TEXT_SEPARATOR);
  return ["translate-job", source, target, canonicalizeGlossary(glossary), cueText].join(COMPONENT_SEPARATOR);
}
