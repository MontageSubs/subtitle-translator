import { IDLE_STANDBY_MARGIN_MS } from "../../config/environment";
import { STORAGE_KEYS } from "../../config/storage";
import { tabStorage } from "../../utils/safeStorage";
import { WorkerRequestError } from "./errors";
import { readSessionClaims, type SessionClaims } from "./tokens";
import type { WorkerSessionPayload } from "./types";

export interface Session extends WorkerSessionPayload, SessionClaims {
  issuedAt: number;
}

function isFresh(candidate: Session | null): candidate is Session {
  return candidate !== null && Date.now() - candidate.issuedAt < candidate.ttl - IDLE_STANDBY_MARGIN_MS;
}

function restoreSession(): Session | null {
  const stored = tabStorage.readJson<Session>(STORAGE_KEYS.session);
  if (isFresh(stored)) return stored;
  if (stored !== null) tabStorage.removeItem(STORAGE_KEYS.session);
  return null;
}

let session: Session | null = restoreSession();

export function hasFreshSession(): boolean {
  if (isFresh(session)) return true;
  session = restoreSession();
  return session !== null;
}

export function adoptSession({ token, challengeKey }: WorkerSessionPayload): void {
  const claims = readSessionClaims(token);
  if (!claims) throw new WorkerRequestError("worker issued an unreadable session", { code: "session_unreadable" });
  session = { token, challengeKey, ...claims, issuedAt: Date.now() };
  tabStorage.writeJson(STORAGE_KEYS.session, session);
}

export function discardSession(): void {
  session = null;
  tabStorage.removeItem(STORAGE_KEYS.session);
}

export function takeFreshSession(): Session | null {
  if (!hasFreshSession()) return null;
  const active = session!;
  discardSession();
  return active;
}
