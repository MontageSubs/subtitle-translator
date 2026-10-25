import type { PreviewTab } from "./markup";
import type { PreviewSession } from "./session";

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

const TAB_STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

function handleTabNavigation(event: KeyboardEvent, session: PreviewSession): void {
  const current = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
  if (!current) return;
  const tabs = [...session.backdrop.querySelectorAll<HTMLElement>('[role="tab"]')];
  const direction = getComputedStyle(current).direction === "rtl" ? -1 : 1;
  const step = TAB_STEPS[event.key];
  let next: number;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else if (step) next = (tabs.indexOf(current) + step * direction + tabs.length) % tabs.length;
  else return;
  event.preventDefault();
  tabs[next].focus();
  session.selectTab(tabs[next].dataset.tab as PreviewTab);
}

export function mountKeyboard(session: PreviewSession): void {
  session.backdrop.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !session.search.closeReplaceIfOpen()) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
  session.backdrop.addEventListener("keydown", (event) => {
    handleTabNavigation(event, session);
    if (session.activeTab === "cards" && !handleEditorShortcut(event, session)) handleMatchNavigation(event, session);
  });
}
