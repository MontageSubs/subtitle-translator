import type { Recipe } from "../../utils/clientCheck";

const FRESHNESS_MARGIN_MS = 5_000;

export function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function readTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const [encoded] = token.split(".");
    return encoded ? JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) : null;
  } catch {
    return null;
  }
}

export interface SessionClaims {
  nonce: number;
  ttl: number;
  recipe: Recipe;
}

export function readSessionClaims(token: string): SessionClaims | null {
  const { nonce, ttl, recipe } = readTokenPayload(token) ?? {};
  return Number.isInteger(nonce) && typeof ttl === "number" && ttl > 0 && recipe && typeof recipe === "object" ? { nonce: nonce as number, ttl, recipe: recipe as Recipe } : null;
}

export function isTokenFresh(token: string): boolean {
  const { exp } = readTokenPayload(token) ?? {};
  return typeof exp === "number" && exp - Date.now() > FRESHNESS_MARGIN_MS;
}

let clearance: string | null = null;

export function currentClearance(): string | null {
  return clearance && isTokenFresh(clearance) ? clearance : null;
}

export function storeClearance(value: string): void {
  clearance = value;
}

export function discardClearance(): void {
  clearance = null;
}
