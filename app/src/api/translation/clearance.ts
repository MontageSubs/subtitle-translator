import { isTokenFresh } from "./tokens";

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
