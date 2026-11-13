import { getLocale, t, th } from "../../i18n";
import { CHEVRON_DOWN_ICON } from "../../render/icons";
import { fileNameInner } from "../../utils/fileNameMarkup";
import { escapeHtml } from "../../utils/escapeHtml";
import { languageName } from "../../utils/languageNames";
import { keyParts, LanguageRow, variantForKey } from "../../lib/subtitle/variants/selection";
import type { SubtitleVariant, VariantGroup } from "../../lib/subtitle/variants/types";

const RADIO_NAME = "variant-choice";
const PREVIEW_MAX_CHARS = 90;

export function languageTitle(language: string | null): string {
  return language ? languageName(language, getLocale()) : t("variant.unknownLanguage");
}

function renderRow(key: string, checked: boolean, title: string, meta: string, sub: string, files?: { id: string; html: string }): string {
  const chevron = files ? `<span class="variant-row__chevron" aria-hidden="true">${CHEVRON_DOWN_ICON}</span>` : "";
  return `
        <li class="variant-row"${files ? ` data-expandable aria-expanded="false"` : ""}>
          <label class="variant-row__label">
            <input type="radio" class="variant-row__input" name="${RADIO_NAME}" value="${escapeHtml(key)}"${checked ? " checked" : ""}${files ? ` aria-controls="${files.id}"` : ""} />
            <span class="variant-row__dot" aria-hidden="true"></span>
            <span class="variant-row__text">
              <span class="variant-row__title"><bdi>${escapeHtml(title)}</bdi>${meta}${chevron}</span>
              ${sub}
            </span>
          </label>
          ${files?.html ?? ""}
        </li>`;
}

const renderSub = (html: string): string => (html ? `<span class="variant-row__sub">${html}</span>` : "");

const renderFileName = (path: string): string => `<bdi data-truncatable data-filename>${fileNameInner(path)}</bdi>`;

function renderFileList(id: string, row: LanguageRow): string {
  return `<ul class="variant-row__files" id="${id}">${row.entries.map(({ group }) => `<li>${renderFileName(group.relativePath)}</li>`).join("")}</ul>`;
}

function renderVariantDetails(variant: SubtitleVariant): string {
  const parts = [variant.trackName, variant.origin === "track" ? variant.format.toUpperCase() : null, t("variant.cueCount", { count: variant.cueCount })]
    .filter((part): part is string => Boolean(part))
    .map((part) => `<bdi>${escapeHtml(part)}</bdi>`);
  return renderSub(parts.join(" · ")) + renderPreview(variant);
}

export function renderLanguageRow(row: LanguageRow, index: number, checked: boolean, multipleFiles: boolean): string {
  const title = languageTitle(row.language);
  const count = multipleFiles ? `<span class="variant-row__meta">${th("task.fileCount", { count: row.entries.length })}</span>` : "";
  const meta = `${renderFlags(row)}${count}`;
  if (row.entries.length > 1) return renderRow(row.key, checked, title, meta, "", { id: `variant-files-${index}`, html: renderFileList(`variant-files-${index}`, row) });
  const [{ group, variant }] = row.entries;
  return renderRow(row.key, checked, title, meta, (multipleFiles ? renderSub(renderFileName(group.relativePath)) : "") + renderVariantDetails(variant));
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
  return renderRow(key, checked, languageTitle(keyParts(key).language), renderFlags(variant), renderVariantDetails(variant));
}
