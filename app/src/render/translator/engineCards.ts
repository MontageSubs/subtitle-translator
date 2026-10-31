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
  return `<a class="engine-card__link" href="${href}">${t(labelKey)}${renderDirectionArrow(12, "link-arrow-icon")}</a>`;
}

function renderSelectableCard(provider: string, descKey: TranslationKey, recommended: boolean): string {
  const badge = recommended ? `<span class="engine-card__badge engine-card__badge--recommended" data-engine-recommended>${t("engine.recommended")}</span>` : "";
  const health = `<span class="engine-card__badge engine-card__badge--unavailable" data-engine-health hidden>${t("engine.maybeUnavailable")}</span>`;
  return `
          <button type="button" class="engine-card" data-provider="${provider}" role="radio" aria-checked="false">
            <span class="engine-card__head">
              <span class="engine-card__name">${providerName(provider)}</span>${badge}${health}
            </span>
            <span class="engine-card__desc">${t(descKey)}</span>
          </button>`;
}

function renderUnavailableCard({ name, descKey, badgeKey, linkKey, href }: UnavailableCard): string {
  return `
          <div class="engine-card engine-card--disabled">
            <div class="engine-card__head">
              <span class="engine-card__name">${name}</span>
              <span class="engine-card__badge engine-card__badge--unavailable">${t(badgeKey)}</span>
            </div>
            <p class="engine-card__desc">${t(descKey)}</p>
            ${renderHelpLink(href, linkKey)}
          </div>`;
}

function renderMoreToggle(): string {
  return `
          <button type="button" class="engine-card engine-card--more" id="engine-more-toggle" aria-expanded="false" aria-controls="engine-more-panel">
            <span class="engine-card__head">
              <span class="engine-card__name">${t("engine.more.title")}</span>
              ${CHEVRON_DOWN_SMALL_ICON}
            </span>
            <span class="engine-card__desc">${t("engine.more.desc")}</span>
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
      <div class="engine-grid">
        <div class="engine-cards" id="engine-cards" role="radiogroup" aria-labelledby="engine-title">${renderSelectableCard("google-nmt-pa", "engine.google.desc", true)}${renderSelectableCard("microsoft-nmt-edge", "engine.microsoft.desc", false)}
        </div>
        <div class="engine-cards">${renderUnavailableCard({ name: "DeepL", descKey: "engine.deepl.desc", badgeKey: "engine.unavailable", linkKey: "engine.helpLink", href: contributeHref })}${renderMoreToggle()}
        </div>
        <div class="engine-cards" id="engine-more-panel" hidden>${renderUnavailableCard({ name: "AI (LLM)", descKey: "engine.llm.desc", badgeKey: "engine.unavailable", linkKey: "engine.helpLink", href: contributeHref })}${renderUnavailableCard({ name: t("engine.local.title"), descKey: "engine.local.desc", badgeKey: "engine.inDevelopment", linkKey: "engine.requestLink", href: accessHref })}
        </div>
      </div>`;
}
