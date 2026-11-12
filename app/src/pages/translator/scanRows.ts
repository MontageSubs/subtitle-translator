import { t, th } from "../../i18n";
import { CLOSE_ICON } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { labelAttrs } from "../../utils/labelAttrs";
import { createSmoothProgress } from "../../utils/smoothProgress";

export interface ScanRowHandle {
  setFraction(fraction: number): void;
  end(): void;
}

export interface ScanRowsHandle {
  begin(name: string, onCancel: () => void): ScanRowHandle;
}

const INDETERMINATE_CLASS = "task-progress-fill task-progress-fill--indeterminate";
const DETERMINATE_CLASS = "task-progress-fill";

function renderRow(name: string): string {
  return `
    <div class="scan-row">
      <div class="scan-row__head">
        <bdi class="scan-row__name" data-truncatable>${escapeHtml(name)}</bdi>
        <span class="scan-row__percent" aria-hidden="true"></span>
        <button type="button" class="file-chip__remove" ${labelAttrs(t("tip.cancelScan", { name }))}>${CLOSE_ICON}</button>
      </div>
      <div class="task-progress-container" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(t("variant.scanning"))}">
        <div class="${INDETERMINATE_CLASS}"></div>
      </div>
      <span class="scan-row__status muted muted--sm">${th("variant.scanning")}</span>
    </div>`;
}

export function mountScanRows(host: HTMLElement, signal: AbortSignal): ScanRowsHandle {
  signal.addEventListener("abort", () => host.replaceChildren(), { once: true });
  return {
    begin(name, onCancel) {
      host.insertAdjacentHTML("beforeend", renderRow(name));
      const row = host.lastElementChild as HTMLElement;
      const fill = row.querySelector<HTMLElement>(".task-progress-fill")!;
      const track = row.querySelector<HTMLElement>(".task-progress-container")!;
      const percent = row.querySelector<HTMLElement>(".scan-row__percent")!;
      row.querySelector<HTMLButtonElement>(".file-chip__remove")!.addEventListener("click", onCancel, { signal });

      function paint(fraction: number): void {
        if (!smoother.hasCrawled()) {
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
        percent.textContent = `${rounded}%`;
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
