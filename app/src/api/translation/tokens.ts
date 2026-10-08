const FRESHNESS_MARGIN_MS = 5_000;

export function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function tokenExpiry(token: string): number | null {
  try {
    const [encoded] = token.split(".");
    if (!encoded) return null;
    const { exp } = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

export function isTokenFresh(token: string): boolean {
  const expiry = tokenExpiry(token);
  return expiry !== null && expiry - Date.now() > FRESHNESS_MARGIN_MS;
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
