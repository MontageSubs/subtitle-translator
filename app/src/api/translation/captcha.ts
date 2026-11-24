import { TURNSTILE_SITE_KEY } from "../../config/environment";
import { getLocale, t, turnstileLanguage, th } from "../../i18n";
import { openGate } from "../../components/workspaceGate";
import { WorkerRequestError } from "./errors";
import { adoptSession } from "./sessionStore";
import { storeClearance } from "./tokens";
import { postJson } from "./transport";
import type { QuotaHint } from "./types";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface ChallengeWidget {
  id: string;
  language: string;
  renderedAt: number;
}

interface PendingToken {
  resolve(token: string): void;
  reject(error: Error): void;
}

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;
const WIDGET_MAX_AGE_MS = 15 * 60_000;
const GATE_RETENTION_KEY = "captcha";

let scriptLoad: Promise<void> | null = null;
let activeChallenge: Promise<void> | null = null;
let widget: ChallengeWidget | null = null;
let pendingToken: PendingToken | null = null;
let gateOpen = false;
const gateListeners = new Set<(open: boolean) => void>();

function setGateOpen(open: boolean): void {
  if (gateOpen === open) return;
  gateOpen = open;
  gateListeners.forEach((listener) => listener(open));
}

export const isChallengeGateOpen = (): boolean => gateOpen;

export function subscribeChallengeGate(listener: (open: boolean) => void): () => void {
  gateListeners.add(listener);
  return () => void gateListeners.delete(listener);
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoad) return scriptLoad;
  if (!document.querySelector(`link[rel='preconnect'][href='${TURNSTILE_ORIGIN}']`)) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = TURNSTILE_ORIGIN;
    document.head.appendChild(link);
  }
  scriptLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      scriptLoad = null;
      reject(new Error("turnstile script failed to load"));
    };
    const timeout = window.setTimeout(fail, SCRIPT_LOAD_TIMEOUT_MS);
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptLoad;
}

function disposeWidget(): void {
  const stale = widget;
  widget = null;
  pendingToken?.reject(new Error("turnstile widget discarded"));
  pendingToken = null;
  if (stale) {
    try {
      window.turnstile?.remove(stale.id);
    } catch {
      return;
    }
  }
}

function openCaptchaGate(quota?: QuotaHint): { slot: HTMLElement; reused: boolean; close(): void } {
  const note = quota ? t(`captcha.quota.${quota.window}`, { percent: quota.percent }) : undefined;
  const gate = openGate(
    { title: t("captcha.text"), note, body: `<div class="captcha-widget"></div>` },
    { key: `${GATE_RETENTION_KEY}:${getLocale()}`, onDispose: disposeWidget },
  );
  return { slot: gate.body.querySelector<HTMLElement>(".captcha-widget")!, reused: gate.reused, close: gate.close };
}

function isReusable(candidate: ChallengeWidget | null): candidate is ChallengeWidget {
  return candidate !== null && candidate.language === turnstileLanguage(getLocale()) && Date.now() - candidate.renderedAt < WIDGET_MAX_AGE_MS;
}

function renderWidget(slot: HTMLElement): ChallengeWidget {
  const language = turnstileLanguage(getLocale());
  slot.innerHTML = "";
  const id = window.turnstile!.render(slot, {
    sitekey: TURNSTILE_SITE_KEY,
    language,
    execution: "execute",
    "refresh-expired": "manual",
    "refresh-timeout": "manual",
    callback: (token: string) => pendingToken?.resolve(token),
    "error-callback": () => pendingToken?.reject(new Error("turnstile challenge failed")),
    "timeout-callback": () => pendingToken?.reject(new Error("turnstile challenge timed out")),
  });
  return { id, language, renderedAt: Date.now() };
}

function requestToken(slot: HTMLElement): Promise<string> {
  if (!isReusable(widget)) disposeWidget();
  let own: PendingToken | null = null;
  const token = new Promise<string>((resolve, reject) => {
    pendingToken?.reject(new Error("turnstile challenge superseded"));
    own = { resolve, reject };
    pendingToken = own;
    if (widget) window.turnstile!.reset(widget.id);
    else widget = renderWidget(slot);
    window.turnstile!.execute(widget.id);
  });
  return token.finally(() => {
    if (pendingToken === own) pendingToken = null;
  });
}

function offerRetry(slot: HTMLElement): Promise<void> {
  disposeWidget();
  return new Promise((resolve) => {
    slot.innerHTML = `
      <div class="captcha-widget__error">
        <p>${th("captcha.error")}</p>
        <button type="button" class="secondary" id="captcha-retry">${th("captcha.retry")}</button>
      </div>
    `;
    slot.querySelector("#captcha-retry")!.addEventListener("click", () => resolve(), { once: true });
  });
}

async function solveChallenge(slot: HTMLElement, hadWidget: boolean): Promise<string> {
  let silentRetryLeft = hadWidget;
  for (;;) {
    try {
      if (!isReusable(widget)) {
        disposeWidget();
        slot.innerHTML = `<div class="captcha-widget__loading">${th("captcha.loading")}</div>`;
      }
      await loadTurnstileScript();
      return await requestToken(slot);
    } catch {
      disposeWidget();
      if (silentRetryLeft) {
        silentRetryLeft = false;
        continue;
      }
      await offerRetry(slot);
    }
  }
}

export function resolveTurnstile(quota?: QuotaHint): Promise<void> {
  if (activeChallenge) return activeChallenge;
  activeChallenge = (async () => {
    if (!TURNSTILE_SITE_KEY) throw new WorkerRequestError("rate limited, but no Turnstile site key is configured");
    const { slot, reused, close } = openCaptchaGate(quota);
    setGateOpen(true);
    try {
      const captchaToken = await solveChallenge(slot, reused && isReusable(widget));
      const payload = await postJson("/clearance", { captchaToken });
      storeClearance(payload.clearance);
      adoptSession(payload);
    } finally {
      close();
      activeChallenge = null;
      setGateOpen(false);
    }
  })();
  return activeChallenge;
}
