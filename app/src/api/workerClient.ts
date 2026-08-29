import { WORKER_URL, TURNSTILE_SITE_KEY, REQUEST_TIMEOUT_MS, IDLE_STANDBY_MARGIN_MS, assertConfigured } from '../config/config';
import { computeProofVector, Recipe } from '../utils/envProbe';
import { Cue } from '../utils/types';
import { t, TranslationKey } from "../i18n";

const STANDBY_TTL_MS = 15_000;
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

interface Session {
  token: string;
  challengeKey: string;
  nonce: number;
  recipe: Recipe;
  issuedAt: number;
  ttl: number;
}

export class WorkerRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly triggerTurnstile = false,
    public readonly fatal = false,
    public readonly capacity = false,
    public readonly code?: string,
    public readonly partialResult?: any
  ) {
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

async function readNdjsonStream(
  response: Response,
  wireCues: Cue[],
  onLog?: (message: string) => void,
  onProgress?: (chunk: TranslateJobResponse) => void
): Promise<any> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: any = null;
  let latestRetryToken: string | undefined = undefined;
  const translatedCuesMap = new Map<number, { id: number; start_ms: number; end_ms: number; text: string; translation: string | null }>();

  for (const c of wireCues) {
    translatedCuesMap.set(c.id, { id: c.id, start_ms: c.start_ms, end_ms: c.end_ms, text: c.text, translation: null });
  }

  try {
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
      if (event.type === "init") {
        if (event.token && event.challengeKey) {
          adoptSession(event, ACTIVE_TTL_MS);
        }
        if (event.retry_token) {
          latestRetryToken = event.retry_token;
        }
      } else if (event.type === "log") {
        onLog?.(event.message);
      } else if (event.type === "result_chunk") {
        if (Array.isArray(event.data?.cues)) {
          for (const deltaCue of event.data.cues) {
            const existing = translatedCuesMap.get(deltaCue.id);
            if (existing) {
              existing.translation = deltaCue.translation;
            } else {
              translatedCuesMap.set(deltaCue.id, deltaCue);
            }
          }
        }
        onProgress?.({
          success: true,
          resolved_source_lang: event.data?.resolved_source_lang || "",
          cues: Array.from(translatedCuesMap.values()),
          approx_splits: [],
          missing_count: 0,
          missing_cues: [],
          quality_warnings: [],
        });
      } else if (event.type === "error") {
        const triggerTurnstile = Boolean(event.trigger_turnstile) || event.message === "verification_required" || event.error === "rate_limited";
        const partialResult = {
          cues: Array.from(translatedCuesMap.values()),
          retry_token: latestRetryToken,
          missing_count: 0,
          missing_cues: [],
          approx_splits: [],
          quality_warnings: []
        };
        throw new WorkerRequestError(
          event.fatal ? "Translation blocked by provider" : (event.message || "translate job failed"),
          !event.fatal, triggerTurnstile, Boolean(event.fatal), false, event.error, partialResult
        );
      } else if (event.type === "result") {
        result = {
          approx_splits: [],
          quality_warnings: [],
          ...event,
          retry_token: event.retry_token || latestRetryToken,
          cues: Array.from(translatedCuesMap.values()),
        };
      }
    }
  }
  } catch (e: any) {
    if (e instanceof WorkerRequestError) throw e;
    const partialResult = {
      cues: Array.from(translatedCuesMap.values()),
      retry_token: latestRetryToken,
      missing_count: 0,
      missing_cues: [],
      approx_splits: [],
      quality_warnings: []
    };
    throw new WorkerRequestError(
      e.message || "Network error during stream",
      true, false, false, false, undefined, partialResult
    );
  }

  if (!result) {
    const partialResult = {
      cues: Array.from(translatedCuesMap.values()),
      retry_token: latestRetryToken,
      missing_count: 0,
      missing_cues: [],
      approx_splits: [],
      quality_warnings: []
    };
    throw new WorkerRequestError("worker stream ended without a result", true, false, false, false, undefined, partialResult);
  }
  return result;
}

async function requestStream(
  path: string,
  body: unknown,
  wireCues: Cue[],
  onLog?: (message: string) => void,
  onProgress?: (chunk: TranslateJobResponse) => void,
  signal?: AbortSignal
): Promise<any> {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    let response: Response;
    try {
      response = await fetch(`${WORKER_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === "AbortError") throw e;
      throw new WorkerRequestError(e.message || "Failed to fetch", true, false, false, false, undefined);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const fatal = payload?.error === "output_blocked";
      const capacity = payload?.error === "capacity_exceeded";
      const triggerTurnstile = response.status === 429 || Boolean(payload?.trigger_turnstile);
      const retryable = !fatal && !capacity && (response.status === 401 || response.status === 429 || response.status >= 500);
      const message = fatal ? "Translation blocked by provider" : (payload?.error || `worker responded ${response.status}`);
      throw new WorkerRequestError(message, retryable, triggerTurnstile, fatal, capacity, payload?.error);
    }
    return await readNdjsonStream(response, wireCues, onLog, onProgress);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function request(path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  assertConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    let response: Response;
    try {
      response = await fetch(`${WORKER_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === "AbortError") throw e;
      throw new WorkerRequestError(e.message || "Failed to fetch", true, false, false, false, undefined);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fatal = payload?.error === "output_blocked";
      const capacity = payload?.error === "capacity_exceeded";
      const triggerTurnstile = response.status === 429 || Boolean(payload?.trigger_turnstile);
      const retryable = !fatal && !capacity && (response.status === 401 || response.status === 429 || response.status >= 500);
      const message = fatal ? "Translation blocked by provider" : resolveErrorMessage(payload?.error, `worker responded ${response.status}`);
      throw new WorkerRequestError(message, retryable, triggerTurnstile, fatal, capacity);
    }
    return payload;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

function isSessionFresh(candidate: Session | null): boolean {
  if (!candidate) return false;
  return Date.now() - candidate.issuedAt < candidate.ttl - IDLE_STANDBY_MARGIN_MS;
}

function adoptSession(payload: { token: string; challengeKey: string; nonce: number; recipe: Recipe }, ttl: number): void {
  session = { token: payload.token, challengeKey: payload.challengeKey, nonce: payload.nonce, recipe: payload.recipe, issuedAt: Date.now(), ttl };
}

export async function handshake(signal?: AbortSignal): Promise<void> {
  return withRetry(async () => {
    const activeClearance = readClearance();
    const payload = await request("/handshake", activeClearance ? { clearance: activeClearance } : {}, signal);
    adoptSession(payload, STANDBY_TTL_MS);
  }, signal);
}

async function ensureSession(signal?: AbortSignal): Promise<Session> {
  if (!isSessionFresh(session)) await handshake(signal);
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
let activeTurnstilePromise: Promise<void> | null = null;

export function updateCaptchaScrollLock(): void {
  const backdrop = document.getElementById("captcha-backdrop");
  const isVisible = Boolean(backdrop && !backdrop.hidden && backdrop.offsetParent !== null);
  if (isVisible) {
    document.body.classList.add("captcha-locked");
  } else {
    document.body.classList.remove("captcha-locked");
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileLoad) {
    if (!document.querySelector("link[rel='preconnect'][href='https://challenges.cloudflare.com']")) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = "https://challenges.cloudflare.com";
      document.head.appendChild(link);
    }
    turnstileLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("turnstile script failed to load"));
      document.head.appendChild(script);
    });
  }
  return turnstileLoad;
}

function ensureCaptchaContainers(): { backdrop: HTMLElement; widget: HTMLElement } {
  let backdrop = document.getElementById("captcha-backdrop");
  let widget = document.getElementById("captcha-widget");
  if (!backdrop || !widget) {
    const parentContainer = document.querySelector(".page-container--nmt") || document.body;
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "captcha-backdrop";
      backdrop.className = "captcha-backdrop";
      backdrop.hidden = true;
      parentContainer.appendChild(backdrop);
    }
    let textEl = backdrop.querySelector(".captcha-backdrop__text") as HTMLElement | null;
    if (!textEl) {
      textEl = document.createElement("div");
      textEl.className = "captcha-backdrop__text";
      backdrop.appendChild(textEl);
    }
    textEl.textContent = t("captcha.text");

    if (!widget) {
      widget = document.createElement("div");
      widget.id = "captcha-widget";
      widget.className = "captcha-backdrop__widget";
      backdrop.appendChild(widget);
    }
  } else {
    const textEl = backdrop.querySelector(".captcha-backdrop__text");
    if (textEl) textEl.textContent = t("captcha.text");
  }
  return { backdrop: backdrop as HTMLElement, widget: widget as HTMLElement };
}

async function resolveTurnstile(): Promise<void> {
  if (activeTurnstilePromise) return activeTurnstilePromise;
  activeTurnstilePromise = (async () => {
    if (!TURNSTILE_SITE_KEY) throw new WorkerRequestError("rate limited, but no Turnstile site key is configured", false);
    const { backdrop, widget } = ensureCaptchaContainers();

    backdrop.hidden = false;
    updateCaptchaScrollLock();
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
      updateCaptchaScrollLock();
      activeTurnstilePromise = null;
    }
  })();
  return activeTurnstilePromise;
}

export interface TranslateJobPayload {
  cues: Cue[];
  glossary: Record<string, string>;
  source: string;
  target: string;
  provider?: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
  retryToken?: string;
}

export interface TranslateJobResponse {
  success: boolean;
  resolved_source_lang: string;
  provider?: string;
  cues: { id: number; start_ms: number; end_ms: number; text: string; translation: string | null }[];
  approx_splits: { unit_id: number; cues: number[]; method: string }[];
  missing_count: number;
  missing_cues: number[];
  quality_warnings: { cue_id: number; cps: number; over_cps: boolean; over_length: boolean }[];
  retry_token?: string;
}

async function attemptTranslateJob(
  job: TranslateJobPayload,
  onLog?: (message: string) => void,
  onProgress?: (chunk: TranslateJobResponse) => void,
  signal?: AbortSignal
): Promise<TranslateJobResponse> {
  const active = await ensureSession(signal);
  session = null;
  const proof = await computeProofVector(active.nonce, active.recipe).catch(() => undefined);
  const wireCues = job.cues.map(({ id, start_ms, end_ms, text }) => ({ id, start_ms, end_ms, text }));
  const digest = computeRequestDigest(job.source, job.target, job.glossary, wireCues);
  const proofCommitment = proof ? proof.transcript[proof.transcript.length - 1] : NaN;
  const answer = await computeAnswer(active.challengeKey, active.nonce, digest, proofCommitment);
  const activeClearance = readClearance();
  
  try {
    const payload = await requestStream("/translate-job", {
      token: active.token,
      answer,
      proof,
      ...job,
      cues: wireCues,
      ...(activeClearance ? { clearance: activeClearance } : {}),
    }, wireCues, onLog, onProgress, signal);
    
    adoptSession(payload, ACTIVE_TTL_MS);
    return payload as TranslateJobResponse;
  } catch (error: any) {
    onLog?.(`Network request failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

const RATE_LIMIT_BASE_BACKOFF_MS = 5_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 60_000;

let rateLimitedUntil = 0;
let rateLimitBackoffMs = RATE_LIMIT_BASE_BACKOFF_MS;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("The operation was aborted.", "AbortError"));
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForRateLimitCooldown(signal?: AbortSignal): Promise<void> {
  const remaining = rateLimitedUntil - Date.now();
  if (remaining > 0) await sleep(remaining, signal);
}

function noteRateLimited(): void {
  rateLimitedUntil = Date.now() + rateLimitBackoffMs;
  rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2, RATE_LIMIT_MAX_BACKOFF_MS);
}

function noteRateLimitCleared(): void {
  rateLimitBackoffMs = RATE_LIMIT_BASE_BACKOFF_MS;
}

async function withRetry<T>(attempt: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  await waitForRateLimitCooldown(signal);
  try {
    const result = await attempt();
    noteRateLimitCleared();
    return result;
  } catch (e) {
    if (signal?.aborted) throw e;
    if (!(e instanceof WorkerRequestError)) throw e;
    if (e.triggerTurnstile) {
      await resolveTurnstile();
      await waitForRateLimitCooldown(signal);
      return attempt();
    }
    if (e.retryable && !e.partialResult) {
      noteRateLimited();
      await waitForRateLimitCooldown(signal);
      return attempt();
    }
    throw e;
  }
}

export function postTranslateJob(
  job: TranslateJobPayload,
  onLog?: (message: string) => void,
  onProgress?: (chunk: TranslateJobResponse) => void,
  signal?: AbortSignal
): Promise<TranslateJobResponse> {
  return withRetry(() => attemptTranslateJob(job, onLog, onProgress, signal), signal);
}

const MAX_AUTO_RETRY_ROUNDS = 2;

async function executePartialJob(
  job: TranslateJobPayload,
  onLog?: (message: string) => void,
  onProgress?: (chunk: TranslateJobResponse) => void,
  signal?: AbortSignal
): Promise<TranslateJobResponse> {
  let currentJob = { ...job };
  let result: TranslateJobResponse | null = null;
  let translatedMap = new Map<number, string | null>();

  for (let round = 0; round < MAX_AUTO_RETRY_ROUNDS + 1; round++) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    
    let roundResult: TranslateJobResponse;
    try {
      roundResult = await postTranslateJob(currentJob, onLog, onProgress, signal);
    } catch (e: any) {
      if (e instanceof WorkerRequestError && e.partialResult && e.retryable && (e.partialResult as TranslateJobResponse).cues?.length > 0) {
        onLog?.(`Stream interrupted: ${e.message}. Resuming from partial result...`);
        roundResult = e.partialResult as TranslateJobResponse;
      } else {
        throw e;
      }
    }

    if (!result) { 
      result = { ...roundResult };
      result.approx_splits ??= [];
      result.quality_warnings ??= [];
    } else {
      if (roundResult.approx_splits) result.approx_splits.push(...roundResult.approx_splits);
      if (roundResult.quality_warnings) result.quality_warnings.push(...roundResult.quality_warnings);
    }

    for (const c of roundResult.cues || []) {
      if (c.translation && c.translation.trim() !== "") {
        translatedMap.set(c.id, c.translation);
      }
    }

    const outstandingCues = job.cues.filter((cue) => {
      const tr = translatedMap.get(cue.id);
      return !tr || tr.trim() === "";
    });

    if (!outstandingCues.length || !roundResult.retry_token || round === MAX_AUTO_RETRY_ROUNDS) {
      if (result) {
        result.cues = job.cues.map(c => ({
          ...c,
          translation: translatedMap.get(c.id) || null
        }));
        result.missing_count = outstandingCues.length;
        result.missing_cues = outstandingCues.map(c => c.id);
        result.retry_token = roundResult.retry_token || result.retry_token;
      }
      break;
    }

    onLog?.(`Auto-retrying ${outstandingCues.length} missing cue(s) (round ${round + 1}/${MAX_AUTO_RETRY_ROUNDS})...`);
    currentJob = { ...job, cues: outstandingCues, retryToken: roundResult.retry_token, contextText: undefined, contextNeedsTranslation: undefined };
  }
  
  return result!;
}

export async function completeTranslateJob(
  job: TranslateJobPayload,
  onLog?: (message: string) => void,
  onProgress?: (chunk: TranslateJobResponse) => void,
  signal?: AbortSignal
): Promise<TranslateJobResponse> {
  return executePartialJob(job, onLog, onProgress, signal);
}
