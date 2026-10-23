import { scopedQuery, ScopedQuery } from "../utils/dom";
import { isolateFromPage } from "../utils/inertScope";
import { focusableWithin, trapFocus } from "../utils/focusTrap";

const OPEN_CLASS = "modal-open";

let openModals = 0;

function acquirePageLock(): () => void {
  if (openModals++ === 0) {
    document.body.classList.add(OPEN_CLASS);
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--openModals === 0) {
      document.body.classList.remove(OPEN_CLASS);
      document.body.style.overflow = "";
    }
  };
}

export interface ModalOptions {
  html: string;
  requestClose?: () => boolean;
  onClosed?: () => void;
}

export interface ModalHandle {
  readonly backdrop: HTMLElement;
  readonly signal: AbortSignal;
  query: ScopedQuery;
  close(): void;
  requestClose(): boolean;
}

export function openModal({ html, requestClose: confirmClose = () => true, onClosed }: ModalOptions): ModalHandle {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);
  const releaseLock = acquirePageLock();
  const releaseIsolation = isolateFromPage(backdrop);
  const lifecycle = new AbortController();
  const returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function close(): void {
    if (lifecycle.signal.aborted) return;
    lifecycle.abort();
    releaseLock();
    releaseIsolation();
    backdrop.remove();
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
    onClosed?.();
  }

  function requestClose(): boolean {
    if (!confirmClose()) return false;
    close();
    return true;
  }

  backdrop.querySelector(".modal__close")?.addEventListener("click", requestClose, { signal: lifecycle.signal });
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) requestClose(); }, { signal: lifecycle.signal });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
    } else if (event.key === "Tab") trapFocus(event, backdrop);
  }, { signal: lifecycle.signal });
  focusableWithin(backdrop)[0]?.focus();

  return {
    backdrop,
    signal: lifecycle.signal,
    query: scopedQuery(backdrop),
    close,
    requestClose,
  };
}
