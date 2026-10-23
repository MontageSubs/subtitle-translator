import { isolateFromPage } from "../utils/inertScope";
import { renderGatePanel, type GatePanelContent } from "./gatePanel";

export interface GateHandle {
  body: HTMLElement;
  close(): void;
}

let host: HTMLElement | null = null;
let current: HTMLElement | null = null;

let releaseIsolation: (() => void) | null = null;

function place(): void {
  if (!host || !current) return;
  releaseIsolation?.();
  if (current.parentElement !== host) host.append(current);
  releaseIsolation = isolateFromPage(current);
}

function releasePlacement(): void {
  releaseIsolation?.();
  releaseIsolation = null;
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
  element.innerHTML = renderGatePanel(content);
  current = element;
  place();
  return { body: element, close: () => current === element && closeGate() };
}
