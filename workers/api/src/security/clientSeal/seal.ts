import { BoundedMap } from "../../support/boundedMap";
import { hmacHex, timingSafeEqual } from "../crypto";
import type { Hello } from "./hello";
import { canonicalHello, type ClientEnvironment } from "./protocol";

const SEAL_CHARS = 32;
const HASH_CHARS = 8;
const MAC_CHARS = 8;
const MAX_REMEMBERED_SEALS = 64;
const remembered = new BoundedMap<string, string>(MAX_REMEMBERED_SEALS);

export const rememberedSeal = (version: string): string | undefined => remembered.get(version);

export const rememberSeal = (version: string, seal: string): void => void remembered.set(version, seal);

export async function deriveSeal(key: string, version: string): Promise<string> {
  return (await hmacHex(key, version)).slice(0, SEAL_CHARS);
}

export const sealHash = (seal: string): string => seal.slice(0, HASH_CHARS);

export const hashMatches = (seal: string, hash: string): boolean => timingSafeEqual(sealHash(seal), hash);

export async function expectedMac(seal: string, protocol: number, hello: Hello, environment: ClientEnvironment): Promise<string> {
  return (await hmacHex(seal, canonicalHello(protocol, hello, environment))).slice(0, MAC_CHARS);
}
