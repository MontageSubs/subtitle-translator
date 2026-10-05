const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const VIEWPORT_RATIO = 0.96;
const OBSERVED_MIN_WIDTH = 200;
const OBSERVED_MIN_HEIGHT = 150;

interface RememberedSize {
  width?: number;
  height?: number;
  maximized: boolean;
}

let remembered: RememberedSize | null = null;

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
    if (maximized) {
      remembered = { maximized: true };
      return;
    }
    if (box.offsetWidth > 0 && box.offsetHeight > 0) remembered = { width: box.offsetWidth, height: box.offsetHeight, maximized: false };
  }

  if (remembered?.maximized) {
    applyMaximized(true);
  } else if (remembered?.width !== undefined && remembered.height !== undefined) {
    box.style.width = `${Math.min(Math.max(remembered.width, MIN_WIDTH), window.innerWidth * VIEWPORT_RATIO)}px`;
    box.style.height = `${Math.min(Math.max(remembered.height, MIN_HEIGHT), window.innerHeight * VIEWPORT_RATIO)}px`;
  }

  const observer = new ResizeObserver((entries) => {
    if (maximized) return;
    if (entries.some(({ contentRect }) => contentRect.width > OBSERVED_MIN_WIDTH && contentRect.height > OBSERVED_MIN_HEIGHT)) remember();
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
