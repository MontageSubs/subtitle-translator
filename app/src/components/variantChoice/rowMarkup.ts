import { getLocale, t, th } from "../../i18n";
import { CHEVRON_DOWN_ICON } from "../../render/icons";
import { escapeHtml } from "../../utils/escapeHtml";
import { labelAttrs } from "../../utils/labelAttrs";
import { languageName } from "../../utils/languageNames";
import { keyParts, LanguageRow, variantForKey } from "../../lib/subtitle/variants/selection";
import type { SubtitleVariant, VariantGroup } from "../../lib/subtitle/variants/types";

const RADIO_NAME = "variant-choice";
const PREVIEW_MAX_CHARS = 90;

export function languageTitle(language: string | null): string {
  return language ? languageName(language, getLocale()) : t("variant.unknownLanguage");
}

function renderRow(key: string, checked: boolean, title: string, meta: string, sub: string, extra: string): string {
  return `
        <li class="variant-row">
          <label class="variant-row__label">
            <input type="radio" class="variant-row__input" name="${RADIO_NAME}" value="${escapeHtml(key)}"${checked ? " checked" : ""} />
            <span class="variant-row__dot" aria-hidden="true"></span>
            <span class="variant-row__text">
              <span class="variant-row__title"><bdi>${escapeHtml(title)}</bdi>${meta}</span>
              ${sub}
            </span>
          </label>
          ${extra}
        </li>`;
}

const renderSub = (html: string): string => (html ? `<span class="variant-row__sub">${html}</span>` : "");

function renderFileList(index: number, row: LanguageRow): string {
  return `<ul class="variant-row__files" id="variant-files-${index}" hidden>${row.entries.map(({ group }) => `<li><bdi data-truncatable>${escapeHtml(group.relativePath)}</bdi></li>`).join("")}</ul>`;
}

export function renderLanguageRow(row: LanguageRow, index: number, checked: boolean, multipleFiles: boolean): string {
  const title = languageTitle(row.language);
  const flags = renderFlags(row);
  const count = multipleFiles ? `<span class="variant-row__meta">${th("task.fileCount", { count: row.entries.length })}</span>` : "";
  const meta = `${flags}${count}`;
  if (!multipleFiles || row.entries.length === 1) {
    const name = multipleFiles ? `<bdi data-truncatable>${escapeHtml(row.entries[0].group.relativePath)}</bdi>` : "";
    return renderRow(row.key, checked, title, meta, renderSub(name), "");
  }
  const toggle = `<button type="button" class="variant-row__toggle" aria-expanded="false" aria-controls="variant-files-${index}" ${labelAttrs(t("variant.toggleFiles"))}>${CHEVRON_DOWN_ICON}</button>`;
  return renderRow(row.key, checked, title, meta, "", `${toggle}${renderFileList(index, row)}`);
}

interface FlagSource {
  isDefault?: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
}

function renderFlags(source: FlagSource): string {
  const flags = [
    source.isDefault ? t("variant.flag.default") : null,
    source.isForced ? t("variant.flag.forced") : null,
    source.isHearingImpaired ? t("variant.flag.sdh") : null,
  ].filter((flag): flag is string => flag !== null);
  return flags.length ? `<span class="variant-row__flags">${flags.map((flag) => `<span class="tag">${escapeHtml(flag)}</span>`).join("")}</span>` : "";
}

function renderPreview(variant: SubtitleVariant): string {
  const text = variant.preview.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return `<span class="variant-row__preview" dir="auto">${escapeHtml(text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}…` : text)}</span>`;
}

export function renderFileRow(group: VariantGroup, key: string, checked: boolean): string {
  const variant = variantForKey(group, key)!;
  const details = [variant.trackName, variant.format.toUpperCase(), t("variant.cueCount", { count: variant.cueCount })].filter(Boolean).map((part) => `<bdi>${escapeHtml(part as string)}</bdi>`).join(" · ");
  return renderRow(key, checked, languageTitle(keyParts(key).language), renderFlags(variant), renderSub(details) + renderPreview(variant), "");
}
