import { HistoryEntry, listHistoryEntries, deleteHistoryEntry, clearHistory } from "../core/history";
import { renderHistoryEntry } from "../core/historyRender";
import { requestHistoryRestore } from "../core/historyRestore";
import { buildPath, navigate } from "../router";
import { t, getLocale } from "../i18n";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const INTL_LOCALES: Record<string, string> = { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en-US" };

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[getLocale()], { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

function mimeFor(format: HistoryEntry["format"]): string {
  return format === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8";
}

function downloadEntry(entry: HistoryEntry): void {
  const blob = new Blob([renderHistoryEntry(entry)], { type: mimeFor(entry.format) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = entry.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function openHistoryPanel(): void {
  const scrim = document.createElement("div");
  scrim.className = "history-drawer__scrim";
  const drawer = document.createElement("aside");
  drawer.className = "history-drawer";
  drawer.innerHTML = `
    <div class="history-drawer__head">
      <span class="history-drawer__title">${t("history.title")}</span>
      <div class="history-drawer__head-actions">
        <button type="button" class="secondary" id="history-clear">${t("history.clearAll")}</button>
        <button type="button" class="history-drawer__close" aria-label="${t("preview.close")}">✕</button>
      </div>
    </div>
    <div class="history-drawer__body">
      <div class="history-list" id="history-list"></div>
    </div>
  `;
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    scrim.classList.add("history-drawer__scrim--visible");
    drawer.classList.add("history-drawer--open");
  });

  const listEl = drawer.querySelector<HTMLElement>("#history-list")!;

  function close() {
    scrim.classList.remove("history-drawer__scrim--visible");
    drawer.classList.remove("history-drawer--open");
    document.body.style.overflow = "";
    setTimeout(() => { scrim.remove(); drawer.remove(); }, 220);
  }

  function restore(entry: HistoryEntry) {
    requestHistoryRestore(entry);
    navigate(buildPath(getLocale(), "nmt"));
    close();
  }

  async function render() {
    const entries = await listHistoryEntries();
    if (!entries.length) {
      listEl.innerHTML = `<p class="muted history-empty">${t("history.empty")}</p>`;
      return;
    }
    listEl.innerHTML = entries.map((entry) => `
      <div class="history-row" data-restore="${entry.id}" role="button" tabindex="0">
        <div class="history-row__info">
          <div class="history-row__name"><span class="history-row__engine">${entry.engine.toUpperCase()}</span> ${escapeHtml(entry.filename)}</div>
          <div class="history-row__meta">${escapeHtml(entry.sourceLang)} → ${escapeHtml(entry.targetLang)} · ${entry.cues.length} ${t("history.cues")} · ${formatDate(entry.createdAt)}</div>
        </div>
        <div class="history-row__actions">
          <button type="button" class="secondary" data-download="${entry.id}">${t("history.download")}</button>
          <button type="button" class="secondary" data-delete="${entry.id}">${t("history.delete")}</button>
        </div>
      </div>`).join("");

    function findEntry(id: string | undefined) {
      return entries.find((e) => e.id === id);
    }

    listEl.querySelectorAll<HTMLElement>("[data-restore]").forEach((row) => {
      const activate = () => restore(findEntry(row.dataset.restore)!);
      row.addEventListener("click", activate);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-download]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); const entry = findEntry(btn.dataset.download); if (entry) downloadEntry(entry); });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => { e.stopPropagation(); await deleteHistoryEntry(btn.dataset.delete!); render(); });
    });
  }

  drawer.querySelector(".history-drawer__close")!.addEventListener("click", close);
  scrim.addEventListener("click", close);
  drawer.querySelector("#history-clear")!.addEventListener("click", async () => { await clearHistory(); render(); });

  render();
}
