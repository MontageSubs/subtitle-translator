const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const VIEWPORT_RATIO = 0.96;

interface RememberedWindow {
  width?: number;
  height?: number;
  maximized: boolean;
}

let remembered: RememberedWindow | null = null;

export interface WindowStateHandle {
  toggleMaximized(): void;
  dispose(): void;
}

function setAppInert(inert: boolean): void {
  const app = document.getElementById("app");
  if (!app) return;
  if (inert) app.setAttribute("inert", "true");
  else app.removeAttribute("inert");
}

export function mountWindowState(backdrop: HTMLElement, box: HTMLElement): WindowStateHandle {
  let maximized = false;

  function applyMaximized(next: boolean): void {
    maximized = next;
    box.classList.toggle("is-maximized", next);
    backdrop.classList.toggle("is-maximized", next);
    setAppInert(next);
  }

  function remember(): void {
    const width = Number.parseFloat(box.style.width);
    const height = Number.parseFloat(box.style.height);
    remembered = { maximized, ...(width > 0 && height > 0 ? { width, height } : {}) };
  }

  if (remembered?.width !== undefined && remembered.height !== undefined) {
    box.style.width = `${Math.min(Math.max(remembered.width, MIN_WIDTH), window.innerWidth * VIEWPORT_RATIO)}px`;
    box.style.height = `${Math.min(Math.max(remembered.height, MIN_HEIGHT), window.innerHeight * VIEWPORT_RATIO)}px`;
  }
  if (remembered?.maximized) applyMaximized(true);

  const observer = new ResizeObserver(() => {
    if (!maximized) remember();
  });
  observer.observe(box);

  return {
    toggleMaximized() {
      applyMaximized(!maximized);
      remember();
    },
    dispose() {
      observer.disconnect();
      setAppInert(false);
    },
  };
}
