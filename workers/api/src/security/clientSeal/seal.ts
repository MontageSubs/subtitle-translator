import { hmacHex, hmacHexFresh, timingSafeEqual } from "../crypto";
import type { Hello } from "./hello";
import { canonicalHello, type ClientEnvironment } from "./protocol";

const SEAL_CHARS = 32;
const HASH_CHARS = 8;
const MAC_CHARS = 8;

export async function deriveSeal(key: string, version: string): Promise<string> {
  return (await hmacHex(key, version)).slice(0, SEAL_CHARS);
}

export const hashMatches = (seal: string, hash: string): boolean => timingSafeEqual(seal.slice(0, HASH_CHARS), hash);

export async function macMatches(seal: string, protocol: number, hello: Hello, environment: ClientEnvironment): Promise<boolean> {
  return timingSafeEqual((await hmacHexFresh(seal, canonicalHello(protocol, hello, environment))).slice(0, MAC_CHARS), hello.mac);
}
