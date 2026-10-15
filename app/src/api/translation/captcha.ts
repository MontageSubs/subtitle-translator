import { TURNSTILE_SITE_KEY } from "../../config/config";
import { getLocale, t } from "../../i18n";
import { renderGatePanel } from "../../components/gatePanel";
import { WorkerRequestError } from "./errors";
import { storeClearance } from "./tokens";
import { postJson } from "./transport";
import type { QuotaHint } from "./types";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string };
  }
}

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

let scriptLoad: Promise<void> | null = null;
let activeChallenge: Promise<void> | null = null;

export function updateCaptchaScrollLock(): void {
  const backdrop = document.getElementById("captcha-backdrop");
  const visible = Boolean(backdrop && !backdrop.hidden && backdrop.offsetParent !== null);
  document.body.classList.toggle("captcha-locked", visible);
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
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

function mountCaptchaPanel(quota?: QuotaHint): { backdrop: HTMLElement; widget: HTMLElement } {
  let backdrop = document.getElementById("captcha-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "captcha-backdrop";
    backdrop.className = "captcha-backdrop";
    backdrop.hidden = true;
    document.body.appendChild(backdrop);
  }
  const note = quota ? t(`captcha.quota.${quota.window}`, { percent: quota.percent }) : undefined;
  backdrop.innerHTML = renderGatePanel({ title: t("captcha.text"), note, body: `<div id="captcha-widget" class="captcha-widget"></div>` });
  return { backdrop, widget: backdrop.querySelector<HTMLElement>("#captcha-widget")! };
}

function renderChallenge(widget: HTMLElement): Promise<string> {
  widget.innerHTML = "";
  return new Promise<string>((resolve, reject) => {
    window.turnstile!.render(widget, {
      sitekey: TURNSTILE_SITE_KEY,
      language: getLocale(),
      callback: (token: string) => resolve(token),
      "error-callback": () => reject(new Error("turnstile challenge failed")),
    });
  });
}

function offerRetry(widget: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    widget.innerHTML = `
      <div class="captcha-backdrop__error">
        <p>${t("captcha.error")}</p>
        <button type="button" class="secondary" id="captcha-retry">${t("captcha.retry")}</button>
      </div>
    `;
    widget.querySelector("#captcha-retry")!.addEventListener("click", () => resolve(), { once: true });
  });
}

async function solveChallenge(widget: HTMLElement): Promise<string> {
  for (;;) {
    try {
      return await renderChallenge(widget);
    } catch {
      await offerRetry(widget);
    }
  }
}

export function resolveTurnstile(quota?: QuotaHint): Promise<void> {
  if (activeChallenge) return activeChallenge;
  activeChallenge = (async () => {
    if (!TURNSTILE_SITE_KEY) throw new WorkerRequestError("rate limited, but no Turnstile site key is configured");
    const { backdrop, widget } = mountCaptchaPanel(quota);
    backdrop.hidden = false;
    updateCaptchaScrollLock();
    widget.innerHTML = `<div class="captcha-backdrop__loading">${t("captcha.loading")}</div>`;
    try {
      await loadTurnstileScript();
      const turnstileToken = await solveChallenge(widget);
      const payload = await postJson("/turnstile", { turnstileToken });
      storeClearance(payload.clearance);
    } finally {
      backdrop.hidden = true;
      updateCaptchaScrollLock();
      activeChallenge = null;
    }
  })();
  return activeChallenge;
}
