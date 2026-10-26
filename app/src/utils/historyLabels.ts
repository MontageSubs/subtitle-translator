import { getLocale, t } from "../i18n";
import type { HistorySummary } from "../lib/history/history";
import { renderDirectionArrow } from "../render/icons";
import { escapeHtml } from "./escapeHtml";
import { languageName } from "./languageNames";
import { providerName } from "./providerNames";

type LanguageCode = Parameters<typeof languageName>[0];

export function renderEngineLabel(job: Pick<HistorySummary, "engine" | "provider">): string {
  const provider = job.provider ? ` · ${escapeHtml(providerName(job.provider))}` : "";
  return `${escapeHtml(job.engine.toUpperCase())}${provider}`;
}

export function renderLanguagePair(job: Pick<HistorySummary, "sourceLang" | "targetLang" | "files">, arrowSize = 12): string {
  const locale = getLocale();
  const plainName = (code: string) => languageName(code as LanguageCode, locale);
  const name = (code: string) => `<bdi>${escapeHtml(plainName(code))}</bdi>`;
  const sources = [...new Set(job.files.map((file) => file.sourceLang ?? job.sourceLang))];
  const source = sources.length > 1
    ? `<span title="${escapeHtml(new Intl.ListFormat(locale, { type: "conjunction" }).format(sources.map(plainName)))}">${t("detect.mode.localMixed", { count: sources.length })}</span>`
    : name(job.sourceLang);
  return `${source} ${renderDirectionArrow(arrowSize)} ${name(job.targetLang)}`;
}
