export type Channel = "main" | "armed" | "rescue";

let selected: Channel = "main";
let limitedOnRescue = false;
let allowanceExhausted = false;

export const isRescueChannel = (): boolean => selected === "rescue";

export const isRescueSelected = (): boolean => selected !== "main";

export const isRescueArmed = (): boolean => selected === "armed";

export const isCooldownWaived = (): boolean => isRescueChannel() && !limitedOnRescue;

export const isAllowanceExhausted = (): boolean => allowanceExhausted;

export function noteRescueLimit(): void {
  if (isRescueChannel()) limitedOnRescue = true;
}

export function noteAllowanceExhausted(): void {
  allowanceExhausted = true;
}

export function switchChannel(channel: Channel): boolean {
  if (selected === channel) return false;
  selected = channel;
  limitedOnRescue = false;
  allowanceExhausted = false;
  return true;
}
