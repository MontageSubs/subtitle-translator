import type { PreviewSession } from "./session";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

export interface KeyboardOptions {
  requestClose(): void;
}

function trapFocus(event: KeyboardEvent, backdrop: HTMLElement): void {
  const focusable = Array.from(backdrop.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleEditorShortcut(event: KeyboardEvent, session: PreviewSession): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;
  const key = event.key.toLowerCase();
  if (key === "f") {
    session.selectTab("cards");
    session.search.focus();
  } else if (key === "h") {
    session.selectTab("cards");
    session.search.openReplace();
  } else if (key === "z") {
    if (event.shiftKey) session.history.redo();
    else session.history.undo();
  } else if (key === "y") {
    session.history.redo();
  } else {
    return false;
  }
  event.preventDefault();
  return true;
}

function handleMatchNavigation(event: KeyboardEvent, session: PreviewSession): void {
  const target = event.target as HTMLElement;
  const editable = target.closest("[data-editable]");
  const isEditing = editable?.getAttribute("contenteditable") === "true";
  const searchInput = session.query("#preview-search-input");
  if (target !== searchInput && !(editable && !isEditing)) return;

  if (event.key === "Enter") session.search.step(event.shiftKey ? "prev" : "next");
  else if (event.key === "ArrowDown") session.search.step("next");
  else if (event.key === "ArrowUp") session.search.step("prev");
  else return;
  event.preventDefault();
}

export function mountKeyboard(session: PreviewSession, { requestClose }: KeyboardOptions): void {
  session.backdrop.addEventListener("keydown", (event) => {
    if (session.activeTab === "cards" && !handleEditorShortcut(event, session)) handleMatchNavigation(event, session);
    if (event.key === "Escape" && !session.search.closeReplaceIfOpen()) requestClose();
    if (event.key === "Tab") trapFocus(event, session.backdrop);
  });
}
