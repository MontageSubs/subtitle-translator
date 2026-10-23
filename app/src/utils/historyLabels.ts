import { getLocale } from "../i18n";
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

export function renderLanguagePair(job: Pick<HistorySummary, "sourceLang" | "targetLang">, arrowSize = 12): string {
  const locale = getLocale();
  const name = (code: string) => `<bdi>${escapeHtml(languageName(code as LanguageCode, locale))}</bdi>`;
  return `${name(job.sourceLang)} ${renderDirectionArrow(arrowSize)} ${name(job.targetLang)}`;
}
