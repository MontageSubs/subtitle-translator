const channel = new EventTarget();
const CHANGE_EVENT = "change";

export function notifyHistoryChange(): void {
  channel.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onHistoryChange(listener: () => void, signal: AbortSignal): void {
  channel.addEventListener(CHANGE_EVENT, listener, { signal });
}
