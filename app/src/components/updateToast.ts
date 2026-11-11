import { labelAttrs } from "../utils/labelAttrs";
import { t, th, TranslationKey } from "../i18n";
import { probeForUpdate, UpdateProbe } from "../update/updateWatcher";
import { CLOSE_ICON } from "../render/icons";
import { escapeHtml } from "../utils/escapeHtml";

function mountToast(id: string, bodyHtml: string, autoDismissMs?: number): HTMLElement {
  document.getElementById(id)?.remove();
  const toast = document.createElement("div");
  toast.id = id;
  toast.className = "sw-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = bodyHtml;
  const header = document.querySelector<HTMLElement>(".site-header");
  if (header) toast.style.setProperty("--toast-top", `${header.getBoundingClientRect().bottom}px`);
  document.body.appendChild(toast);
  toast.querySelector(".sw-toast__dismiss")!.addEventListener("click", () => toast.remove());
  if (autoDismissMs) setTimeout(() => toast.remove(), autoDismissMs);
  return toast;
}

export function showToastMessage(message: string, durationMs = 4000): void {
  mountToast(
    "app-info-toast",
    `<span>${escapeHtml(message)}</span>
     <button type="button" class="icon-btn sw-toast__dismiss" ${labelAttrs(t("preview.close"))}>${CLOSE_ICON}</button>`,
    durationMs
  );
}

export function showUpdateToast(): void {
  const toast = mountToast(
    "sw-update-toast",
    `<span>${th("update.available")}</span>
     <button type="button" class="secondary" id="sw-update-reload">${th("update.reload")}</button>
     <button type="button" class="icon-btn sw-toast__dismiss" aria-label="${th("preview.close")}">${CLOSE_ICON}</button>`
  );
  toast.querySelector("#sw-update-reload")!.addEventListener("click", () => location.reload());
}

const PROBE_RESULT_MS = 5000;

const PROBE_MESSAGES: Record<Exclude<UpdateProbe, "available">, TranslationKey> = {
  current: "update.current",
  unreachable: "update.unreachable",
};

export function bindVersionCheck(): void {
  let probing = false;
  document.addEventListener("click", async (event) => {
    if (probing || !(event.target as HTMLElement).closest(".footer-version__check")) return;
    probing = true;
    showToastMessage(t("update.checking"), 0);
    const result = await probeForUpdate();
    probing = false;
    if (result === "available") showUpdateToast();
    else showToastMessage(t(PROBE_MESSAGES[result]), PROBE_RESULT_MS);
  });
}
