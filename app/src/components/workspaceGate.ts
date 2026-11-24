import { getLocale, t, th } from "../i18n";
import { escapeHtml } from "../utils/escapeHtml";
import { isolateFromPage } from "../utils/inertScope";
import { pageRoutePath } from "../render/paths";
import { renderExternalLinkIcon } from "../render/icons";

export interface GatePanelContent {
  title: string;
  note?: string;
  body: string;
  help?: boolean;
  wide?: boolean;
}

const HELP_DOC_SLUG = "abuse-protection";

function renderGatePanel({ title, note, body, help = true, wide = false }: GatePanelContent): string {
  const helpHref = pageRoutePath(import.meta.env.BASE_URL, getLocale(), "docs", [HELP_DOC_SLUG]);
  return `
    <section class="gate-panel${wide ? " gate-panel--wide" : ""}" role="alertdialog" aria-labelledby="gate-title">
      <h2 class="gate-panel__title" id="gate-title">${escapeHtml(title)}</h2>
      ${note ? `<p class="gate-panel__note">${escapeHtml(note)}</p>` : ""}
      <div class="gate-panel__body">${body}</div>
      ${help ? `<a class="gate-panel__help" href="${helpHref}" target="_blank" rel="noopener">${th("gate.help")}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>` : ""}
    </section>`;
}

export interface GateHandle {
  body: HTMLElement;
  reused: boolean;
  close(): void;
}

export interface GateRetention {
  key: string;
  onDispose(): void;
}

interface RetainedGate extends GateRetention {
  element: HTMLElement;
}

let host: HTMLElement | null = null;
let current: HTMLElement | null = null;
let retained: RetainedGate | null = null;

let releases: (() => void)[] = [];
let observer: MutationObserver | null = null;

function isolate(): void {
  if (host && current) releases.push(isolateFromPage(current, host));
}

function releasePlacement(): void {
  observer?.disconnect();
  observer = null;
  releases.forEach((release) => release());
  releases = [];
}

function place(): void {
  if (!host || !current) return;
  releasePlacement();
  if (current.parentElement !== host) host.append(current);
  isolate();
  observer = new MutationObserver(isolate);
  observer.observe(host, { childList: true });
}

function discardRetained(): void {
  const gate = retained;
  retained = null;
  if (!gate) return;
  if (current === gate.element) closeGate();
  gate.element.remove();
  gate.onDispose();
}

export function setGateHost(element: HTMLElement | null): void {
  if (element !== host) discardRetained();
  host = element;
  place();
}

let stopCentering: (() => void) | null = null;

function centerInVisibleBand(element: HTMLElement): void {
  const { top, height } = element.getBoundingClientRect();
  const visibleTop = Math.max(0, -top);
  const extent = Math.min(height, window.innerHeight - top) - visibleTop;
  if (extent <= 0) return;
  element.style.setProperty("--gate-center", `${visibleTop + extent / 2}px`);
  element.style.setProperty("--gate-extent", `${extent}px`);
}

function followVisibleBand(element: HTMLElement): void {
  const controller = new AbortController();
  const update = (): void => centerInVisibleBand(element);
  const resizes = new ResizeObserver(update);
  resizes.observe(element);
  document.addEventListener("scroll", update, { capture: true, passive: true, signal: controller.signal });
  window.addEventListener("resize", update, { passive: true, signal: controller.signal });
  stopCentering = () => {
    controller.abort();
    resizes.disconnect();
  };
  update();
}

export function closeGate(): void {
  const gate = current;
  current = null;
  stopCentering?.();
  stopCentering = null;
  releasePlacement();
  if (!gate) return;
  if (retained?.element === gate) gate.hidden = true;
  else gate.remove();
}

function updateGateNote(element: HTMLElement, note: string | undefined): void {
  element.querySelector(".gate-panel__note")?.remove();
  if (!note) return;
  const paragraph = document.createElement("p");
  paragraph.className = "gate-panel__note";
  paragraph.textContent = note;
  element.querySelector(".gate-panel__title")?.after(paragraph);
}

export function openGate(content: GatePanelContent, retention?: GateRetention): GateHandle {
  closeGate();
  const reusable = retention && retained?.key === retention.key && retained.element.isConnected ? retained.element : null;
  if (retained && !reusable) discardRetained();
  const element = reusable ?? document.createElement("div");
  if (reusable) {
    updateGateNote(element, content.note);
    element.hidden = false;
  } else {
    element.className = "access-gate";
    element.innerHTML = `<div class="access-gate__stage">${renderGatePanel(content)}</div>`;
    if (retention) retained = { ...retention, element };
  }
  current = element;
  place();
  followVisibleBand(element);
  return { body: element, reused: reusable !== null, close: () => current === element && closeGate() };
}
