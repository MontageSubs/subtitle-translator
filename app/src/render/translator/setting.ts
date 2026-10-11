import { t } from "../../i18n";
import { escapeHtml } from "../../utils/escapeHtml";
import { CHEVRON_DOWN_SMALL_ICON } from "../icons";

interface SettingInput {
  id: string;
  title: string;
  primary: string;
  more?: string;
  moreOpen?: boolean;
}

function renderMore(id: string, title: string, body: string, open: boolean): string {
  return `
        <details class="more" id="${id}-more"${open ? " open" : ""}>
          <summary class="more__summary" aria-label="${escapeHtml(`${t("setting.more")}: ${title}`)}" aria-describedby="${id}-more-state">
            <span class="more__label">${t("setting.more")}</span>
            <span class="more__state" id="${id}-more-state"></span>
            ${CHEVRON_DOWN_SMALL_ICON}
          </summary>
          <div class="more__body">${body}</div>
        </details>`;
}

export function renderSetting({ id, title, primary, more, moreOpen = false }: SettingInput): string {
  return `
      <section class="setting" aria-labelledby="${id}-title">
        <h3 class="setting__title" id="${id}-title">${title}</h3>${primary}${more ? renderMore(id, title, more, moreOpen) : ""}
      </section>`;
}
