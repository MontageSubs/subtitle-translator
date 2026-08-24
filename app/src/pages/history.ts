import { HistoryEntry, HistoryCue, listHistoryEntries, getHistoryEntry, deleteHistoryEntry, updateHistoryEntryCues, clearHistory } from "../core/history";
import { renderHistoryEntry } from "../core/historyRender";
import { requestHistoryRestore } from "../core/historyRestore";
import { openPreviewModal, PreviewCard } from "../components/previewModal";
import { msToSrtTime } from "../core/srtRender";
import { buildPath, navigate } from "../router";
import { getLocale, t } from "../i18n";
import { setPageMeta } from "../head";
import { formatDateTime } from "../core/formatDate";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function toPreviewCards(entry: HistoryEntry): PreviewCard[] {
  return entry.cues.map((c) => ({
    id: c.id, start: msToSrtTime(c.start_ms), end: msToSrtTime(c.end_ms),
    source: c.sourceText, target: c.translatedText, missing: !c.translatedText,
  }));
}

async function openEntryPreview(id: string): Promise<void> {
  const entry = await getHistoryEntry(id);
  if (!entry) return;
  openPreviewModal(renderHistoryEntry(entry), toPreviewCards(entry), {
    lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(entry.updatedAt) }),
    onApply: (edits) => {
      const cues: HistoryCue[] = entry.cues.map((c) => (edits.has(c.id) ? { ...c, translatedText: edits.get(c.id)! } : c));
      updateHistoryEntryCues(entry.id, cues).then((updated) => {
        if (!updated) return;
        entry.cues = updated.cues;
        entry.updatedAt = updated.updatedAt;
      }).catch(() => {});
      return { lastUpdatedLabel: t("preview.lastUpdated", { date: formatDateTime(Date.now()) }) };
    },
  });
}

function restoreEntry(entry: HistoryEntry): void {
  requestHistoryRestore(entry);
  navigate(buildPath(getLocale(), "nmt"));
}

export function mount(container: HTMLElement, _signal: AbortSignal): void {
  setPageMeta(t("nav.history"), t("meta.history.description"));
  container.innerHTML = `
    <section class="step">
      <div class="step__head">
        <span class="step__title">${t("nav.history")}</span>
        <button type="button" class="text-link" id="history-clear">${t("history.clearAll")}</button>
      </div>
      <div class="history-list" id="history-list"></div>
    </section>
  `;

  const listEl = container.querySelector<HTMLElement>("#history-list")!;
  container.querySelector("#history-clear")!.addEventListener("click", async () => { await clearHistory(); render(); });

  async function render(): Promise<void> {
    const entries = await listHistoryEntries();
    if (!entries.length) {
      listEl.innerHTML = `<p class="muted history-empty">${t("history.empty")}</p>`;
      return;
    }
    listEl.innerHTML = entries.map((entry) => `
      <div class="history-row" data-open="${entry.id}" role="button" tabindex="0">
        <div class="history-row__info">
          <div class="history-row__name"><span class="history-row__engine">${entry.engine.toUpperCase()}</span> ${escapeHtml(entry.filename)}</div>
          <div class="history-row__meta">${escapeHtml(entry.sourceLang)} → ${escapeHtml(entry.targetLang)} · ${entry.cues.length} ${t("history.cues")} · ${formatDateTime(entry.updatedAt)}</div>
        </div>
        <div class="history-row__actions">
          <button type="button" class="secondary" data-restore="${entry.id}">${t("history.restore")}</button>
          <button type="button" class="secondary" data-download="${entry.id}">${t("history.download")}</button>
          <button type="button" class="secondary" data-delete="${entry.id}">${t("history.delete")}</button>
        </div>
      </div>`).join("");

    const findEntry = (id: string | undefined) => entries.find((e) => e.id === id);

    listEl.querySelectorAll<HTMLElement>("[data-open]").forEach((row) => {
      const activate = () => openEntryPreview(row.dataset.open!);
      row.addEventListener("click", activate);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); const entry = findEntry(btn.dataset.restore); if (entry) restoreEntry(entry); });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-download]").forEach((btn) => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); const entry = findEntry(btn.dataset.download); if (entry) downloadEntry(entry); });
    });
    listEl.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => { e.stopPropagation(); await deleteHistoryEntry(btn.dataset.delete!); render(); });
    });
  }

  render();
}
