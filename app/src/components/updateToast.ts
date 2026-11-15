import { t } from "../i18n";
import { isUpdateReady, probeForUpdate, UpdateProbe } from "../update/updateWatcher";
import { dismissToast, PERSISTENT, showToast, TOAST_PRIORITY } from "./toast";

const UPDATE_READY_KEY = "update-ready";
const UPDATE_CHECK_KEY = "update-check";
const PROBE_RESULT_MS = 5000;

const PROBE_MESSAGES: Record<Exclude<UpdateProbe, "available">, "update.current" | "update.unreachable"> = {
  current: "update.current",
  unreachable: "update.unreachable",
};

export function showUpdateToast(userRequested = false): void {
  showToast({
    key: UPDATE_READY_KEY,
    message: t("update.available"),
    priority: userRequested ? TOAST_PRIORITY.info : TOAST_PRIORITY.background,
    durationMs: PERSISTENT,
    action: { label: t("update.reload"), run: () => location.reload() },
  });
}

export function bindVersionCheck(): void {
  let probing = false;
  document.addEventListener("click", async (event) => {
    if (probing || !(event.target as HTMLElement).closest(".footer-version__check")) return;
    if (isUpdateReady()) return showUpdateToast(true);
    probing = true;
    showToast({ key: UPDATE_CHECK_KEY, message: t("update.checking"), durationMs: PERSISTENT });
    const result = await probeForUpdate();
    probing = false;
    if (result === "available") {
      dismissToast(UPDATE_CHECK_KEY);
      showUpdateToast(true);
    } else {
      showToast({ key: UPDATE_CHECK_KEY, message: t(PROBE_MESSAGES[result]), durationMs: PROBE_RESULT_MS });
    }
  });
}
