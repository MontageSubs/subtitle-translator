import { CLOSE_ICON } from "../../render/icons";
import { t } from "../../i18n";
import { escapeHtml } from "../../utils/escapeHtml";
import { labelAttrs } from "../../utils/labelAttrs";
import { createToastController, ToastController, ToastSpec, ToastSurface } from "./toastController";

export { PERSISTENT, TOAST_PRIORITY } from "./toastController";
export type { ToastSpec } from "./toastController";

const TOAST_ID = "app-toast";

function renderBody(spec: ToastSpec): string {
  const action = spec.action ? `<button type="button" class="secondary sw-toast__action">${escapeHtml(spec.action.label)}</button>` : "";
  return `<span>${escapeHtml(spec.message)}</span>${action}<button type="button" class="icon-btn sw-toast__dismiss" ${labelAttrs(t("preview.close"))}>${CLOSE_ICON}</button>`;
}

function createSurface(controller: () => ToastController): ToastSurface {
  let element: HTMLElement | null = null;
  let activeSpec: ToastSpec | null = null;

  function build(): HTMLElement {
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "sw-toast";
    toast.setAttribute("role", "status");
    toast.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (!activeSpec) return;
      if (target.closest(".sw-toast__action")) activeSpec.action?.run();
      if (target.closest(".sw-toast__action, .sw-toast__dismiss")) controller().dismiss(activeSpec.key);
    });
    toast.addEventListener("pointerenter", () => controller().hold());
    toast.addEventListener("pointerleave", () => controller().release());
    toast.addEventListener("focusin", () => controller().hold());
    toast.addEventListener("focusout", () => controller().release());
    return toast;
  }

  function attach(toast: HTMLElement): void {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (header) toast.style.setProperty("--toast-top", `${header.getBoundingClientRect().bottom}px`);
    document.body.appendChild(toast);
  }

  return {
    render(spec, replacing) {
      activeSpec = spec;
      if (!replacing || !element?.isConnected) {
        element?.remove();
        element = build();
        element.innerHTML = renderBody(spec);
        attach(element);
        return;
      }
      element.innerHTML = renderBody(spec);
    },
    clear() {
      activeSpec = null;
      element?.remove();
      element = null;
    },
  };
}

let controller: ToastController | undefined;

function toasts(): ToastController {
  controller ??= createToastController(createSurface(() => controller!));
  return controller;
}

export const showToast = (spec: ToastSpec): void => toasts().push(spec);

export const dismissToast = (key: string): void => controller?.dismiss(key);
