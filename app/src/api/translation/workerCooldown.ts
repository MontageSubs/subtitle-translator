import { STORAGE_KEYS } from "../../config/storage";
import { persistentStorage } from "../../utils/safeStorage";
import { isCooldownWaived, isRescueArmed, noteRescueLimit } from "./channel";

const COOLDOWN_SECONDS: readonly number[] = [30, 60, 180, 300, 600];
const SUSTAINED_COOLDOWN_SECONDS = 900;

interface CooldownRecord {
  at: number;
  strikes: number;
}

const listeners = new Set<() => void>();
const successListeners = new Set<() => void>();

export const announceCooldownChange = (): void => listeners.forEach((listener) => listener());

const unixSeconds = (milliseconds: number): number => Math.floor(milliseconds / 1000);

const cooldownMs = (strikes: number): number => (COOLDOWN_SECONDS[strikes - 1] ?? SUSTAINED_COOLDOWN_SECONDS) * 1000;

function isCooldownRecord(value: unknown): value is CooldownRecord {
  const { at, strikes } = (value ?? {}) as Partial<CooldownRecord>;
  return Number.isInteger(at) && Number.isInteger(strikes) && strikes! >= 1;
}

function readRecord(): CooldownRecord | null {
  const stored = persistentStorage.readJson<unknown>(STORAGE_KEYS.workerCooldown);
  if (isCooldownRecord(stored)) return stored;
  if (stored !== null) persistentStorage.removeItem(STORAGE_KEYS.workerCooldown);
  return null;
}

export function activeCooldownUntil(now: number = Date.now()): number | null {
  if (isCooldownWaived()) return null;
  const record = readRecord();
  if (!record) return null;
  const anchor = Math.min(record.at, unixSeconds(now));
  if (anchor !== record.at) persistentStorage.writeJson(STORAGE_KEYS.workerCooldown, { ...record, at: anchor });
  const until = anchor * 1000 + cooldownMs(record.strikes);
  return until > now ? until : null;
}

export function noteWorkerLimit(now: number = Date.now()): void {
  if (activeCooldownUntil(now) !== null) return;
  const strikes = (readRecord()?.strikes ?? 0) + 1;
  persistentStorage.writeJson(STORAGE_KEYS.workerCooldown, { at: unixSeconds(now), strikes });
  noteRescueLimit();
  announceCooldownChange();
}

export const translationHoldUntil = (): number | null => (isRescueArmed() ? null : activeCooldownUntil());

export function noteTranslationSuccess(): void {
  successListeners.forEach((listener) => listener());
  if (readRecord() === null) return;
  persistentStorage.removeItem(STORAGE_KEYS.workerCooldown);
  announceCooldownChange();
}

export function onTranslationSuccess(listener: () => void): () => void {
  successListeners.add(listener);
  return () => successListeners.delete(listener);
}

export function onCooldownChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
