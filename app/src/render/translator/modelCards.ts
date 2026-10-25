import { t, LocaleCode, TranslationKey } from "../../i18n";
import { buildPath } from "../../router/router";
import { providerName } from "../../utils/providerNames";
import { CHEVRON_DOWN_SMALL_ICON, renderDirectionArrow } from "../icons";

interface UnavailableCard {
  name: string;
  descKey: TranslationKey;
  badgeKey: TranslationKey;
  linkKey: TranslationKey;
  href: string;
}

function renderHelpLink(href: string, labelKey: TranslationKey): string {
  return `<a class="model-card__link" href="${href}">${t(labelKey)}${renderDirectionArrow(12, "link-arrow-icon")}</a>`;
}

function renderSelectableCard(provider: string, descKey: TranslationKey, recommended: boolean): string {
  const badge = recommended ? `<span class="model-card__badge model-card__badge--recommended" data-engine-recommended>${t("model.recommended")}</span>` : "";
  const health = `<span class="model-card__badge model-card__badge--unavailable" data-engine-health hidden>${t("model.maybeUnavailable")}</span>`;
  return `
          <button type="button" class="model-card" data-provider="${provider}" role="radio" aria-checked="false">
            <span class="model-card__head">
              <span class="model-card__name">${providerName(provider)}</span>${badge}${health}
            </span>
            <span class="model-card__desc">${t(descKey)}</span>
          </button>`;
}

function renderUnavailableCard({ name, descKey, badgeKey, linkKey, href }: UnavailableCard): string {
  return `
          <div class="model-card model-card--disabled">
            <div class="model-card__head">
              <span class="model-card__name">${name}</span>
              <span class="model-card__badge model-card__badge--unavailable">${t(badgeKey)}</span>
            </div>
            <p class="model-card__desc">${t(descKey)}</p>
            ${renderHelpLink(href, linkKey)}
          </div>`;
}

function renderMoreToggle(): string {
  return `
          <button type="button" class="model-card model-card--more" id="model-more-toggle" aria-expanded="false" aria-controls="model-more-panel">
            <span class="model-card__head">
              <span class="model-card__name">${t("model.more.title")}</span>
              ${CHEVRON_DOWN_SMALL_ICON}
            </span>
            <span class="model-card__desc">${t("model.more.desc")}</span>
          </button>`;
}

export function renderModelCards(locale: LocaleCode): string {
  const contributeHref = buildPath(locale, "contribute");
  const accessHref = buildPath(locale, "docs", ["model-access"]);
  return `
      <select id="provider-select" class="sr-only-select" tabindex="-1" aria-hidden="true" aria-labelledby="engine-title">
        <option value="google-nmt-pa">${providerName("google-nmt-pa")}</option>
        <option value="microsoft-nmt-edge">${providerName("microsoft-nmt-edge")}</option>
      </select>
      <div class="model-grid">
        <div class="model-cards" id="model-cards" role="radiogroup" aria-labelledby="engine-title">${renderSelectableCard("google-nmt-pa", "model.google.desc", true)}${renderSelectableCard("microsoft-nmt-edge", "model.microsoft.desc", false)}
        </div>
        <div class="model-cards">${renderUnavailableCard({ name: "DeepL", descKey: "model.deepl.desc", badgeKey: "model.unavailable", linkKey: "model.helpLink", href: contributeHref })}${renderMoreToggle()}
        </div>
        <div class="model-cards" id="model-more-panel" hidden>${renderUnavailableCard({ name: "AI (LLM)", descKey: "model.llm.desc", badgeKey: "model.unavailable", linkKey: "model.helpLink", href: contributeHref })}${renderUnavailableCard({ name: t("model.local.title"), descKey: "model.local.desc", badgeKey: "model.inDevelopment", linkKey: "model.requestLink", href: accessHref })}
        </div>
      </div>`;
}
