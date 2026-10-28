import { isolateFromPage } from "../utils/inertScope";
import { renderGatePanel, type GatePanelContent } from "./gatePanel";

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
