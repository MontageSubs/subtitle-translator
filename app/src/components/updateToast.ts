import { t } from "../i18n";
import { applyServiceWorkerUpdate } from "../core/swUpdate";

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

export function showUpdateToast(): void {
  const toast = mountToast(
    "sw-update-toast",
    `<span>${t("update.available")}</span>
     <button type="button" class="secondary" id="sw-update-reload">${t("update.reload")}</button>
     <button type="button" class="sw-toast__dismiss" aria-label="${t("preview.close")}">✕</button>`
  );
  toast.querySelector("#sw-update-reload")!.addEventListener("click", () => applyServiceWorkerUpdate());
}
