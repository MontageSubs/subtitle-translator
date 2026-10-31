import { getLocale, t } from "../i18n";
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
      ${help ? `<a class="gate-panel__help" href="${helpHref}" target="_blank" rel="noopener">${t("gate.help")}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>` : ""}
    </section>`;
}

export interface GateHandle {
  body: HTMLElement;
  close(): void;
}

let host: HTMLElement | null = null;
let current: HTMLElement | null = null;

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

export function setGateHost(element: HTMLElement | null): void {
  host = element;
  place();
}

export function closeGate(): void {
  const gate = current;
  current = null;
  releasePlacement();
  gate?.remove();
}

export function openGate(content: GatePanelContent): GateHandle {
  closeGate();
  const element = document.createElement("div");
  element.className = "access-gate";
  element.innerHTML = `<div class="access-gate__stage">${renderGatePanel(content)}</div>`;
  current = element;
  place();
  return { body: element, close: () => current === element && closeGate() };
}
