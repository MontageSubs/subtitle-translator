const DRAG_THRESHOLD_PX = 4;

export function enableDragScroll(el: HTMLElement): void {
  let originX = 0;
  let originScrollLeft = 0;
  let dragging = false;
  let armed = false;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
    armed = true;
    dragging = false;
    originX = e.clientX;
    originScrollLeft = el.scrollLeft;
  });

  el.addEventListener("pointermove", (e) => {
    if (!armed) return;
    const delta = e.clientX - originX;
    if (!dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    el.scrollLeft = originScrollLeft - delta;
  });

  const release = (e: PointerEvent) => {
    if (dragging) el.releasePointerCapture(e.pointerId);
    armed = false;
    dragging = false;
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}
