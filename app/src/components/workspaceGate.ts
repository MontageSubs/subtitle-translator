import { renderGatePanel, type GatePanelContent } from "./gatePanel";

export interface GateHandle {
  body: HTMLElement;
  close(): void;
}

let host: HTMLElement | null = null;
let current: HTMLElement | null = null;

function setInert(container: HTMLElement, gate: HTMLElement | null): void {
  container.classList.toggle("workspace--gated", gate !== null);
  for (const child of Array.from(container.children)) if (child !== gate) child.toggleAttribute("inert", gate !== null);
}

function place(): void {
  if (!host || !current) return;
  host.append(current);
  setInert(host, current);
}

export function setGateHost(element: HTMLElement | null): void {
  host = element;
  place();
}

export function closeGate(): void {
  const gate = current;
  current = null;
  gate?.remove();
  if (host) setInert(host, null);
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
