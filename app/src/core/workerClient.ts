import { WORKER_URL, TURNSTILE_SITE_KEY, REQUEST_TIMEOUT_MS, IDLE_STANDBY_MARGIN_MS, assertConfigured } from "../config";
import { computeProofVector, Recipe } from "./envProbe";
import { Cue } from "./types";
import { t, TranslationKey } from "../i18n";

const STANDBY_TTL_MS = 60_000;
const ACTIVE_TTL_MS = 20_000;
const CUE_TEXT_SEPARATOR = "\u0000";
const COMPONENT_SEPARATOR = "\u0002";
const GLOSSARY_KV_SEPARATOR = "\u0000";
const GLOSSARY_ENTRY_SEPARATOR = "\u0001";

const ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  invalid_request: "error.invalidRequest",
  verification_failed: "error.verificationFailed",
  verification_required: "error.verificationRequired",
  capacity_exceeded: "error.capacityExceeded",
  payload_too_large: "error.payloadTooLarge",
  rate_limited: "error.rateLimited",
};

function resolveErrorMessage(errorCode: string | undefined, fallback: string): string {
  const key = errorCode ? ERROR_MESSAGE_KEYS[errorCode] : undefined;
  return key ? t(key) : fallback;
}

export interface Stats {
  total: number;
  last24h: number;
}

interface Session {
  token: string;
  challengeKey: string;
  nonce: number;
  recipe: Recipe;
  issuedAt: number;
  ttl: number;
}

export class WorkerRequestError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly triggerTurnstile = false, public readonly fatal = false, public readonly capacity = false) {
    super(message);
  }
}

let session: Session | null = null;

const CLEARANCE_TTL_MS = 5 * 60_000;
const CLEARANCE_STORAGE_KEY = "subtitle-translator:clearance";

interface StoredClearance {
  token: string;
  expiresAt: number;
}

function readClearance(): string | null {
  try {
    const raw = sessionStorage.getItem(CLEARANCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClearance;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(CLEARANCE_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function writeClearance(token: string): void {
  try {
    const stored: StoredClearance = { token, expiresAt: Date.now() + CLEARANCE_TTL_MS };
    sessionStorage.setItem(CLEARANCE_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    return;
  }
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string };
  }
}

async function readNdjsonStream(response: Response, onLog?: (message: string) => void): Promise<any> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: any = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === "log") onLog?.(event.message);
      else if (event.type === "error") {
        throw new WorkerRequestError(
          event.fatal ? t("error.outputBlocked") : event.message || "translate job failed",
          !event.fatal, Boolean(event.trigger_turnstile), Boolean(event.fatal)
        );
      } else if (event.type === "result") {
        result = event;
      }
    }
  }
  if (!result) throw new WorkerRequestError("worker stream ended without a result", true);
  return result;
}

async function requestStream(path: string, body: unknown, onLog?: (message: string) => void): Promise<any> {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const fatal = payload?.error === "output_blocked";
      const capacity = payload?.error === "capacity_exceeded";
      const retryable = !fatal && !capacity && (response.status === 401 || response.status === 429 || response.status >= 500);
      const message = fatal ? t("error.outputBlocked") : resolveErrorMessage(payload?.error, `worker responded ${response.status}`);
      throw new WorkerRequestError(message, retryable, Boolean(payload?.trigger_turnstile), fatal, capacity);
    }
    return await readNdjsonStream(response, onLog);
  } finally {
    clearTimeout(timer);
  }
}

async function request(path: string, body: unknown): Promise<any> {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fatal = payload?.error === "output_blocked";
      const capacity = payload?.error === "capacity_exceeded";
      const retryable = !fatal && !capacity && (response.status === 401 || response.status === 429 || response.status >= 500);
      const message = fatal ? t("error.outputBlocked") : resolveErrorMessage(payload?.error, `worker responded ${response.status}`);
      throw new WorkerRequestError(message, retryable, Boolean(payload?.trigger_turnstile), fatal, capacity);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function isSessionFresh(candidate: Session | null): boolean {
  if (!candidate) return false;
  return Date.now() - candidate.issuedAt < candidate.ttl - IDLE_STANDBY_MARGIN_MS;
}

function adoptSession(payload: { token: string; challengeKey: string; nonce: number; recipe: Recipe }, ttl: number): void {
  session = { token: payload.token, challengeKey: payload.challengeKey, nonce: payload.nonce, recipe: payload.recipe, issuedAt: Date.now(), ttl };
}

export async function handshake(): Promise<Stats> {
  return withRetry(async () => {
    const activeClearance = readClearance();
    const payload = await request("/handshake", activeClearance ? { clearance: activeClearance } : {});
    adoptSession(payload, STANDBY_TTL_MS);
    return { total: payload.stats?.total ?? 0, last24h: payload.stats?.last24h ?? 0 };
  });
}

async function ensureSession(): Promise<Session> {
  if (!isSessionFresh(session)) await handshake();
  return session!;
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function signChallenge(challengeKey: string, message: string): Promise<number> {
  const key = await crypto.subtle.importKey(
    "raw", decodeBase64Url(challengeKey) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new DataView(signature).getUint32(0);
}

function computeAnswer(challengeKey: string, nonce: number, text: string, proofCommitment: number): Promise<number> {
  return signChallenge(challengeKey, `${nonce}:${proofCommitment}:${text}`);
}

function canonicalizeCues(cues: Pick<Cue, "text">[]): string {
  return cues.map((cue) => cue.text).join(CUE_TEXT_SEPARATOR);
}

function canonicalizeGlossary(glossary: Record<string, string>): string {
  return Object.entries(glossary)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}${GLOSSARY_KV_SEPARATOR}${v}`)
    .join(GLOSSARY_ENTRY_SEPARATOR);
}

function computeRequestDigest(source: string, target: string, glossary: Record<string, string>, cues: Pick<Cue, "text">[]): string {
  return ["translate-job", source, target, canonicalizeGlossary(glossary), canonicalizeCues(cues)].join(COMPONENT_SEPARATOR);
}

let turnstileLoad: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileLoad) {
    turnstileLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("turnstile script failed to load"));
      document.head.appendChild(script);
    });
  }
  return turnstileLoad;
}

async function resolveTurnstile(): Promise<void> {
  if (!TURNSTILE_SITE_KEY) throw new WorkerRequestError("rate limited, but no Turnstile site key is configured", false);
  const backdrop = document.getElementById("captcha-backdrop");
  const widgetEl = document.getElementById("captcha-widget");
  if (!backdrop || !widgetEl) throw new WorkerRequestError("rate limited, but the page is missing the captcha backdrop container", false);
  const widget: HTMLElement = widgetEl;

  backdrop.hidden = false;
  widget.innerHTML = `<div class="captcha-backdrop__loading">${t("captcha.loading")}</div>`;
  await loadTurnstileScript();

  function renderChallenge(): Promise<string> {
    widget.innerHTML = "";
    return new Promise<string>((resolve, reject) => {
      window.turnstile!.render(widget, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => resolve(token),
        "error-callback": () => reject(new Error("turnstile challenge failed")),
      });
    });
  }

  try {
    let turnstileToken: string | null = null;
    while (turnstileToken === null) {
      try {
        turnstileToken = await renderChallenge();
      } catch {
        turnstileToken = await new Promise<string | null>((resolve) => {
          widget.innerHTML = `
            <div class="captcha-backdrop__error">
              <p>${t("captcha.error")}</p>
              <button type="button" class="secondary" id="captcha-retry">${t("captcha.retry")}</button>
            </div>
          `;
          widget.querySelector("#captcha-retry")!.addEventListener("click", () => resolve(null), { once: true });
        });
      }
    }
    const payload = await request("/turnstile", { turnstileToken });
    writeClearance(payload.clearance);
  } finally {
    backdrop.hidden = true;
  }
}

export interface TranslateJobPayload {
  cues: Cue[];
  glossary: Record<string, string>;
  source: string;
  target: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  retryToken?: string;
}

export interface TranslateJobResponse {
  success: boolean;
  resolved_source_lang: string;
  cues: { id: number; start_ms: number; end_ms: number; text: string; translation: string | null }[];
  approx_splits: { unit_id: number; cues: number[]; method: string }[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: { cue_id: number; cps: number; over_cps: boolean; over_length: boolean }[];
  retry_token?: string;
}

async function attemptTranslateJob(job: TranslateJobPayload, onLog?: (message: string) => void): Promise<TranslateJobResponse> {
  const active = await ensureSession();
  session = null;
  const proof = await computeProofVector(active.nonce, active.recipe).catch(() => undefined);
  const wireCues = job.cues.map(({ id, start_ms, end_ms, text }) => ({ id, start_ms, end_ms, text }));
  const digest = computeRequestDigest(job.source, job.target, job.glossary, wireCues);
  const proofCommitment = proof ? proof.transcript[proof.transcript.length - 1] : NaN;
  const answer = await computeAnswer(active.challengeKey, active.nonce, digest, proofCommitment);
  const activeClearance = readClearance();
  const payload = await requestStream("/translate-job", {
    token: active.token,
    answer,
    proof,
    ...job,
    cues: wireCues,
    ...(activeClearance ? { clearance: activeClearance } : {}),
  }, onLog);
  adoptSession(payload, ACTIVE_TTL_MS);
  return payload as TranslateJobResponse;
}

const RATE_LIMIT_BASE_BACKOFF_MS = 5_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 60_000;

let rateLimitedUntil = 0;
let rateLimitBackoffMs = RATE_LIMIT_BASE_BACKOFF_MS;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimitCooldown(): Promise<void> {
  const remaining = rateLimitedUntil - Date.now();
  if (remaining > 0) await sleep(remaining);
}

function noteRateLimited(): void {
  rateLimitedUntil = Date.now() + rateLimitBackoffMs;
  rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2, RATE_LIMIT_MAX_BACKOFF_MS);
}

function noteRateLimitCleared(): void {
  rateLimitBackoffMs = RATE_LIMIT_BASE_BACKOFF_MS;
}

async function withRetry<T>(attempt: () => Promise<T>): Promise<T> {
  await waitForRateLimitCooldown();
  try {
    const result = await attempt();
    noteRateLimitCleared();
    return result;
  } catch (e) {
    if (!(e instanceof WorkerRequestError)) throw e;
    if (e.triggerTurnstile) {
      await resolveTurnstile();
      await waitForRateLimitCooldown();
      return attempt();
    }
    if (e.retryable) {
      noteRateLimited();
      await waitForRateLimitCooldown();
      return attempt();
    }
    throw e;
  }
}

export function postTranslateJob(job: TranslateJobPayload, onLog?: (message: string) => void): Promise<TranslateJobResponse> {
  return withRetry(() => attemptTranslateJob(job, onLog));
}

const MAX_AUTO_RETRY_ROUNDS = 2;

export async function completeTranslateJob(job: TranslateJobPayload, onLog?: (message: string) => void): Promise<TranslateJobResponse> {
  let result = await postTranslateJob(job, onLog);
  for (let round = 0; result.success && result.missing_count > 0 && result.retry_token && round < MAX_AUTO_RETRY_ROUNDS; round++) {
    const missingIds = new Set(result.missing_cues);
    const outstandingCues = job.cues.filter((cue) => missingIds.has(cue.id));
    if (!outstandingCues.length) break;
    const retryResult = await postTranslateJob({ ...job, cues: outstandingCues, retryToken: result.retry_token, contextText: undefined, contextNeedsTranslation: undefined }, onLog);
    const translatedById = new Map(retryResult.cues.map((cue) => [cue.id, cue]));
    result = { ...retryResult, cues: result.cues.map((cue) => translatedById.get(cue.id) ?? cue) };
  }
  return result;
}
