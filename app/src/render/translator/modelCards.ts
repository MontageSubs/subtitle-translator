import { t, LocaleCode } from "../../i18n";
import { buildPath } from "../../router/router";
import { renderDirectionArrow } from "../icons";

function renderHelpLink(href: string, labelKey: "model.helpLink" | "model.requestLink"): string {
  return `<a class="model-card__link" href="${href}">${t(labelKey)}${renderDirectionArrow(12, "link-arrow-icon")}</a>`;
}

function renderSelectableCard(provider: string, name: string, descKey: "model.google.desc" | "model.microsoft.desc", recommended: boolean): string {
  const badge = recommended ? `<span class="model-card__badge model-card__badge--recommended">${t("model.recommended")}</span>` : "";
  return `
        <button type="button" class="model-card" data-provider="${provider}" role="radio" aria-checked="false">
          <div class="model-card__head">
            <span class="model-card__name">${name}</span>${badge}
          </div>
          <p class="model-card__desc">${t(descKey)}</p>
        </button>`;
}

function renderUnavailableCard(name: string, descKey: "model.deepl.desc" | "model.llm.desc", href: string): string {
  return `
        <div class="model-card model-card--disabled">
          <div class="model-card__head">
            <span class="model-card__name">${name}</span>
            <span class="model-card__badge model-card__badge--unavailable">${t("model.unavailable")}</span>
          </div>
          <p class="model-card__desc">${t(descKey)}</p>
          ${renderHelpLink(href, "model.helpLink")}
        </div>`;
}

export function renderModelCards(locale: LocaleCode): string {
  const contributeHref = buildPath(locale, "contribute");
  const accessHref = buildPath(locale, "docs", ["model-access"]);
  return `
      <select id="provider-select" class="sr-only-select" tabindex="-1" aria-hidden="true">
        <option value="google-nmt-pa">Google NMT</option>
        <option value="microsoft-nmt-edge">Microsoft NMT</option>
      </select>
      <div class="model-cards" id="model-cards" role="radiogroup" aria-label="${t("field.engine")}">${renderSelectableCard("google-nmt-pa", "Google NMT", "model.google.desc", true)}${renderSelectableCard("microsoft-nmt-edge", "Microsoft NMT", "model.microsoft.desc", false)}${renderUnavailableCard("DeepL", "model.deepl.desc", contributeHref)}${renderUnavailableCard("LLM (AI)", "model.llm.desc", contributeHref)}
        <div class="model-card model-card--disabled model-card--more">
          <div class="model-card__head">
            <span class="model-card__name">${t("model.more.title")}</span>
            <span class="model-card__badge">${t("model.inDevelopment")}</span>
          </div>
          <p class="model-card__desc">${t("model.more.desc")}</p>
          ${renderHelpLink(accessHref, "model.requestLink")}
        </div>
      </div>`;
}
