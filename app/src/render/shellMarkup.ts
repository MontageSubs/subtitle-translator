import { PAGE_IDS, PageId } from "../router.pages";
import { LocaleCode, LOCALES } from "../i18n/locales.config";
import { TranslationKey, translate } from "../i18n/dictionaries";
import { LOCALE_LABELS } from "../localeLabels";
import { GLOBE_ICON, HAMBURGER_ICON } from "./icons";
import { NAV_LABEL_KEYS } from "./metaKeys";
import { routePath } from "./paths";
import { REPO_URL, SOCIAL_LINKS } from "../social";

export interface ShellContext {
  locale: LocaleCode;
  page: PageId;
  basePath: string;
}

function routeTo(ctx: ShellContext, locale: LocaleCode, page: PageId): string {
  return routePath(ctx.basePath, [locale, page]);
}

function docRoute(ctx: ShellContext, slug: string): string {
  return routePath(ctx.basePath, [ctx.locale, "docs", slug]);
}

function tr(ctx: ShellContext, key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(ctx.locale, key, params);
}

export function renderHeader(ctx: ShellContext): string {
  const navLinks = PAGE_IDS.map((page) => {
    const active = page === ctx.page ? " site-nav__link--active" : "";
    const current = page === ctx.page ? ` aria-current="page"` : "";
    return `<a class="site-nav__link${active}" href="${routeTo(ctx, ctx.locale, page)}"${current}>${tr(ctx, NAV_LABEL_KEYS[page])}</a>`;
  }).join("");

  const localeOptions = LOCALES.map((locale) => {
    const active = locale === ctx.locale ? " locale-menu__option--active" : "";
    return `<a class="locale-menu__option${active}" href="${routeTo(ctx, locale, ctx.page)}" hreflang="${locale}">${LOCALE_LABELS[locale]}</a>`;
  }).join("");

  return `
    <header class="site-header">
      <input type="checkbox" id="nav-toggle" class="nav-toggle-input sr-only" />
      <div class="site-header__inner">
        <label for="nav-toggle" class="nav-toggle" aria-label="${tr(ctx, "nav.menu")}">${HAMBURGER_ICON}</label>
        <a class="site-header__brand" href="${routeTo(ctx, ctx.locale, "nmt")}">Subtitle Translator</a>
        <nav class="site-nav" aria-label="${tr(ctx, "nav.menu")}">${navLinks}</nav>
        <details class="locale-menu">
          <summary class="locale-menu__trigger" aria-label="${LOCALE_LABELS[ctx.locale]}">${GLOBE_ICON}</summary>
          <div class="locale-menu__popover">${localeOptions}</div>
        </details>
      </div>
      <label class="nav-scrim" for="nav-toggle" aria-hidden="true"></label>
    </header>
  `;
}

export function renderFooter(ctx: ShellContext): string {
  const navEntries = [
    { label: tr(ctx, "footer.home"), href: "https://subs.js.org/" },
    { label: "Telegram", href: SOCIAL_LINKS.telegram },
    { label: "GitHub", href: SOCIAL_LINKS.github },
    { label: "Discord", href: SOCIAL_LINKS.discord },
    { label: "BlueSky", href: SOCIAL_LINKS.bluesky },
  ];

  const licenseLink = `<a href="${REPO_URL}/blob/main/LICENSE" target="_blank" rel="noopener">MIT</a>`;
  const actionButtons: { label: string; href: string; external?: boolean }[] = [
    { label: tr(ctx, "footer.terms"), href: docRoute(ctx, "terms") },
    { label: tr(ctx, "footer.privacy"), href: docRoute(ctx, "privacy") },
    { label: tr(ctx, "footer.feedback"), href: docRoute(ctx, "report-issue") },
    { label: tr(ctx, "footer.source"), href: REPO_URL, external: true },
  ];

  return `
    <footer class="site-footer">
      <div class="footer-left">
        <nav class="footer-nav" aria-label="${tr(ctx, "footer.home")}">
          ${navEntries.map((entry, index) => `${index > 0 ? `<span class="footer-sep" aria-hidden="true">·</span>` : ""}<a href="${entry.href}" target="_blank" rel="noopener">${entry.label}</a>`).join("")}
        </nav>
        <div class="footer-brand">
          <span class="footer-org">${tr(ctx, "footer.org")}</span>
          <span class="footer-slogan">${tr(ctx, "footer.slogan")}</span>
        </div>
      </div>
      <div class="footer-right">
        <div class="footer-line">${tr(ctx, "footer.license", { license: licenseLink })}</div>
        <div class="footer-btns">
          ${actionButtons.map((btn) => `<a class="footer-btn" href="${btn.href}"${btn.external ? ` target="_blank" rel="noopener"` : ""}>${btn.label}</a>`).join("")}
        </div>
      </div>
    </footer>
  `;
}
