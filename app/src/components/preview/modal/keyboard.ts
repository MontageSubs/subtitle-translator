import type { PreviewSession } from "./session";

function commitActiveEdit(event: KeyboardEvent): void {
  (event.target as HTMLElement).closest<HTMLElement>("[data-editable]")?.blur();
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isTopmostModal(backdrop: HTMLElement): boolean {
  const backdrops = document.querySelectorAll(".modal-backdrop");
  return backdrops[backdrops.length - 1] === backdrop;
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
  } else if ((key === "z" || key === "y") && !isTextField(event.target)) {
    commitActiveEdit(event);
    if (key === "y" || event.shiftKey) session.history.redo();
    else session.history.undo();
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
  if (target !== searchInput && !(editable && !isEditing && session.search.isSearching())) return;

  if (event.key === "Enter") session.search.step(event.shiftKey ? "prev" : "next");
  else if (event.key === "ArrowDown") session.search.step("next");
  else if (event.key === "ArrowUp") session.search.step("prev");
  else return;
  event.preventDefault();
}

export function mountKeyboard(session: PreviewSession): void {
  session.backdrop.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const editing = (event.target as HTMLElement).closest<HTMLElement>('[data-editable][contenteditable="true"]');
    if (!editing && !session.search.closeReplaceIfOpen()) return;
    editing?.blur();
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
  document.addEventListener("keydown", (event) => {
    if (session.activeTab !== "cards" || !isTopmostModal(session.backdrop)) return;
    if (handleEditorShortcut(event, session)) return;
    if (session.backdrop.contains(event.target as Node)) handleMatchNavigation(event, session);
  }, { signal: session.signal });
}
