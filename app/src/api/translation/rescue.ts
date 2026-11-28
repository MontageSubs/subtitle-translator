import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { isRescueChannel, switchChannel, type Channel } from "./channel";
import { hasRescueEndpoint } from "./endpoints";
import { discardSession } from "./sessionStore";
import { announceCooldownChange } from "./workerCooldown";

const DAY_MS = 86_400_000;

const utcDay = (now: number): number => Math.floor(now / DAY_MS);

export const isRescueClaimable = (now: number = Date.now()): boolean =>
  hasRescueEndpoint() && persistentStorage.readJson<number>(STORAGE_KEYS.rescueClaimedDay) !== utcDay(now);

export function claimRescue(now: number = Date.now()): boolean {
  if (!isRescueClaimable(now)) return false;
  persistentStorage.writeJson(STORAGE_KEYS.rescueClaimedDay, utcDay(now));
  return true;
}

export function selectChannel(channel: Channel): void {
  const usedRescue = isRescueChannel();
  if (!switchChannel(channel)) return;
  if (usedRescue !== isRescueChannel()) discardSession();
  announceCooldownChange();
}
