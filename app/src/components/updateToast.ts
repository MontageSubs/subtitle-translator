import { t } from "../i18n";
import { applyServiceWorkerUpdate } from '../utils/swUpdate';
import { CLOSE_ICON } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";

function mountToast(id: string, bodyHtml: string, autoDismissMs?: number): HTMLElement {
  document.getElementById(id)?.remove();
  const toast = document.createElement("div");
  toast.id = id;
  toast.className = "sw-toast";
  toast.innerHTML = bodyHtml;
  document.body.appendChild(toast);
  toast.querySelector(".sw-toast__dismiss")!.addEventListener("click", () => toast.remove());
  if (autoDismissMs) setTimeout(() => toast.remove(), autoDismissMs);
  return toast;
}

export function showToastMessage(message: string, durationMs = 4000): void {
  mountToast(
    "app-info-toast",
    `<span>${escapeHtml(message)}</span>
     <button type="button" class="icon-btn sw-toast__dismiss" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>`,
    durationMs
  );
}

export function showUpdateToast(): void {
  const toast = mountToast(
    "sw-update-toast",
    `<span>${t("update.available")}</span>
     <button type="button" class="secondary" id="sw-update-reload">${t("update.reload")}</button>
     <button type="button" class="icon-btn sw-toast__dismiss" aria-label="${t("preview.close")}">${CLOSE_ICON}</button>`
  );
  toast.querySelector("#sw-update-reload")!.addEventListener("click", () => applyServiceWorkerUpdate());
}
