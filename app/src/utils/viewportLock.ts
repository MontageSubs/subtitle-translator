import { TOUCH_MEDIA_QUERY, VIEWPORT_CONTENT, VIEWPORT_LOCKED_CONTENT } from "../config/viewport";

export function mountTouchViewportLock(): void {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return;
  const touch = window.matchMedia(TOUCH_MEDIA_QUERY);
  const apply = (): void => viewport.setAttribute("content", touch.matches ? VIEWPORT_LOCKED_CONTENT : VIEWPORT_CONTENT);
  apply();
  touch.addEventListener("change", apply);
}
