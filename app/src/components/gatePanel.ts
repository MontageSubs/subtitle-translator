import { getLocale, t } from "../i18n";
import { escapeHtml } from "../utils/escapeHtml";
import { pageRoutePath } from "../render/paths";
import { renderExternalLinkIcon } from "../render/icons";

export interface GatePanelContent {
  title: string;
  note?: string;
  body: string;
  help?: boolean;
  wide?: boolean;
}

const HELP_DOC_SLUG = "abuse-protection";

export function renderGatePanel({ title, note, body, help = true, wide = false }: GatePanelContent): string {
  const helpHref = pageRoutePath(import.meta.env.BASE_URL, getLocale(), "docs", [HELP_DOC_SLUG]);
  return `
    <section class="gate-panel${wide ? " gate-panel--wide" : ""}" role="alertdialog" aria-labelledby="gate-title">
      <h2 class="gate-panel__title" id="gate-title">${escapeHtml(title)}</h2>
      ${note ? `<p class="gate-panel__note">${escapeHtml(note)}</p>` : ""}
      <div class="gate-panel__body">${body}</div>
      ${help ? `<a class="gate-panel__help" href="${helpHref}" target="_blank" rel="noopener">${t("gate.help")}${renderExternalLinkIcon(t("a11y.opensInNewTab"))}</a>` : ""}
    </section>`;
}
