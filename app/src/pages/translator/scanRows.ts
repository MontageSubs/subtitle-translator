import { fileNameInner } from "../../utils/fileNameMarkup";
import { getLocale, t, th } from "../../i18n";
import { CLOSE_ICON, PAUSE_ICON, PLAY_ICON, SKIP_ICON } from "../../render/icons";
import { mountConfirmButton } from "../../components/confirmButton";
import { escapeHtml } from "../../utils/escapeHtml";
import { labelAttrs } from "../../utils/labelAttrs";
import { createSmoothProgress } from "../../utils/smoothProgress";
import { formatWholePercent } from "../../utils/numberFormat";

export interface ScanRowOptions {
  position: { index: number; total: number };
  onSkip: () => void;
  onCancel: () => void;
  onPausedChange: (paused: boolean) => void;
}

export interface ScanRowHandle {
  setFraction(fraction: number): void;
  end(): void;
}

export interface ScanRowsHandle {
  begin(name: string, options: ScanRowOptions): ScanRowHandle;
}

const INDETERMINATE_CLASS = "task-progress-fill task-progress-fill--indeterminate";
const DETERMINATE_CLASS = "task-progress-fill";

function renderRow(name: string, { index, total }: ScanRowOptions["position"]): string {
  const skip = total > 1 ? `<button type="button" class="icon-btn scan-row__skip" ${labelAttrs(t("scan.skip"))}>${SKIP_ICON}</button>` : "";
  const batch = total > 1 ? `<span class="scan-row__batch tag" role="img" ${labelAttrs(t("scan.batchPosition", { index, total }))}>${index}/${total}</span>` : "";
  return `
    <div class="scan-row">
      <div class="scan-row__head">
        ${batch}
        <bdi class="scan-row__name" data-truncatable data-filename>${fileNameInner(name)}</bdi>
        <span class="scan-row__percent" aria-hidden="true"></span>
        ${skip}
        <button type="button" class="icon-btn scan-row__pause" ${labelAttrs(t("scan.pause"))}>${PAUSE_ICON}</button>
        <button type="button" class="icon-btn icon-btn--confirmable scan-row__cancel">${CLOSE_ICON}<span class="icon-btn__label"></span></button>
      </div>
      <div class="task-progress-container" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(t("variant.scanning"))}">
        <div class="${INDETERMINATE_CLASS}"></div>
      </div>
      <span class="scan-row__status muted muted--sm" role="status">${th("variant.scanning")}</span>
    </div>`;
}

export function mountScanRows(host: HTMLElement, signal: AbortSignal): ScanRowsHandle {
  signal.addEventListener("abort", () => host.replaceChildren(), { once: true });
  return {
    begin(name, options) {
      host.insertAdjacentHTML("beforeend", renderRow(name, options.position));
      const row = host.lastElementChild as HTMLElement;
      const fill = row.querySelector<HTMLElement>(".task-progress-fill")!;
      const track = row.querySelector<HTMLElement>(".task-progress-container")!;
      const percent = row.querySelector<HTMLElement>(".scan-row__percent")!;
      const status = row.querySelector<HTMLElement>(".scan-row__status")!;
      const pauseButton = row.querySelector<HTMLButtonElement>(".scan-row__pause")!;
      let paused = false;

      mountConfirmButton({
        button: row.querySelector<HTMLButtonElement>(".scan-row__cancel")!,
        label: row.querySelector<HTMLElement>(".icon-btn__label")!,
        idleText: () => t(options.position.total > 1 ? "scan.cancelBatch" : "scan.cancel", { name }),
        confirmText: () => t("scan.cancelConfirm"),
        icons: { idle: CLOSE_ICON },
        onConfirm: options.onCancel,
        signal,
      });

      row.querySelector<HTMLButtonElement>(".scan-row__skip")?.addEventListener("click", options.onSkip, { signal });

      pauseButton.addEventListener("click", () => {
        paused = !paused;
        pauseButton.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
        pauseButton.setAttribute("aria-label", t(paused ? "scan.resume" : "scan.pause"));
        pauseButton.title = t(paused ? "scan.resume" : "scan.pause");
        status.textContent = t(paused ? "scan.paused" : "variant.scanning");
        row.classList.toggle("scan-row--paused", paused);
        if (paused) {
          smoother.pause();
          paint(smoother.value());
        } else {
          smoother.resume();
          paint(smoother.value());
        }
        options.onPausedChange(paused);
      }, { signal });

      function paint(fraction: number): void {
        if (!smoother.hasCrawled() && !paused) {
          fill.className = INDETERMINATE_CLASS;
          fill.style.removeProperty("--progress");
          track.removeAttribute("aria-valuenow");
          percent.textContent = "";
          return;
        }
        const rounded = Math.floor(fraction * 100);
        fill.className = DETERMINATE_CLASS;
        fill.style.setProperty("--progress", fraction.toFixed(4));
        track.setAttribute("aria-valuenow", String(rounded));
        percent.textContent = formatWholePercent(rounded, getLocale());
      }

      const smoother = createSmoothProgress(paint);
      smoother.reset(0);
      return {
        setFraction: (fraction) => smoother.set(fraction),
        end() {
          smoother.stop();
          row.remove();
        },
      };
    },
  };
}
