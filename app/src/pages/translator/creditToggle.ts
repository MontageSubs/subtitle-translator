import type { WorkspaceContext } from "./context";

export function mountCreditToggle(ctx: WorkspaceContext): void {
  const { state, signal } = ctx;
  const toggle = ctx.query<HTMLInputElement>("#credit-toggle");

  function applyEnabled(enabled: boolean): void {
    state.creditEnabled = enabled;
    state.files.forEach((file) => { file.creditEnabled = enabled; });
  }

  function adoptRestoredValue(): void {
    if (state.creditEnabled !== state.creditPreferred) return;
    state.creditPreferred = toggle.checked;
    applyEnabled(toggle.checked);
  }

  toggle.addEventListener("change", () => {
    state.creditPreferred = toggle.checked;
    applyEnabled(toggle.checked);
    ctx.flow.formattingChanged();
  }, { signal });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) toggle.checked = state.creditEnabled;
    else adoptRestoredValue();
  }, { signal });
  window.addEventListener("pagehide", () => { toggle.checked = state.creditPreferred; }, { signal });
  if (document.readyState !== "complete") window.addEventListener("load", adoptRestoredValue, { signal, once: true });
  adoptRestoredValue();
}
