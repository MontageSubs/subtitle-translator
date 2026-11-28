import { CLOSE_ICON } from "../../render/icons";
import { t } from "../../i18n";
import { escapeHtml } from "../../utils/escapeHtml";
import { labelAttrs } from "../../utils/labelAttrs";
import { createToastController, ToastAction, ToastController, ToastSpec, ToastSurface } from "./toastController";
import { LOCALE_SWITCH_ATTRIBUTE } from "../../config/localeSwitch";
import { localeDirection } from "../../i18n/locales.config";

export { PERSISTENT, TOAST_PRIORITY } from "./toastController";
export type { ToastSpec } from "./toastController";

const TOAST_ID = "app-toast";

const ACTION_CLASS = "secondary sw-toast__action";

function renderAction(action: ToastAction): string {
  const label = escapeHtml(action.label);
  return "href" in action
    ? `<a class="${ACTION_CLASS}" href="${escapeHtml(action.href)}" hreflang="${action.switchesTo}" ${LOCALE_SWITCH_ATTRIBUTE}>${label}</a>`
    : `<button type="button" class="${ACTION_CLASS}">${label}</button>`;
}

function renderBody(spec: ToastSpec): string {
  const action = spec.action ? renderAction(spec.action) : "";
  const dismiss = spec.dismissible === false ? "" : `<button type="button" class="icon-btn sw-toast__dismiss" ${labelAttrs(spec.closeLabel ?? t("preview.close"))}>${CLOSE_ICON}</button>`;
  return `<span>${escapeHtml(spec.message)}</span>${action}${dismiss}`;
}

function fill(toast: HTMLElement, spec: ToastSpec): void {
  if (spec.language) {
    toast.lang = spec.language;
    toast.dir = localeDirection(spec.language);
  } else {
    toast.removeAttribute("lang");
    toast.removeAttribute("dir");
  }
  toast.toggleAttribute("data-nosnippet", Boolean(spec.language));
  toast.innerHTML = renderBody(spec);
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
      const spec = activeSpec;
      const ran = Boolean(target.closest(".sw-toast__action")) && spec.action !== undefined && "run" in spec.action;
      if (ran) (spec.action as { run(): void }).run();
      const closed = Boolean(target.closest(".sw-toast__dismiss"));
      if (closed) spec.onClose?.();
      if (spec.dismissible !== false && (ran || closed)) controller().dismiss(spec.key);
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
        fill(element, spec);
        attach(element);
        return;
      }
      fill(element, spec);
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
