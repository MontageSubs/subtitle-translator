import { docPages } from "virtual:docs-content";
import { PAGE_IDS, PageId } from "../router/router.pages";
import { LocaleCode, LOCALES } from "../i18n/locales.config";
import { TranslationKey, translate } from "../i18n/dictionaries";
import { LOCALE_LABELS } from "../config/localeLabels";
import {
  GLOBE_ICON,
  HAMBURGER_ICON,
  HOME_ICON,
  TELEGRAM_ICON,
  GITHUB_ICON,
  DISCORD_ICON,
  BLUESKY_ICON,
} from "./icons";
import { BRAND_KEY, NAV_LABEL_KEYS } from "./metaKeys";
import { routePath, pageRoutePath } from "./paths";
import { REPO_URL, SOCIAL_LINKS } from "../config/social";
import { STATUS_URL } from "../config/config";

export interface ShellContext {
  locale: LocaleCode;
  page: PageId;
  basePath: string;
}

function routeTo(ctx: ShellContext, locale: LocaleCode, page: PageId): string {
  return pageRoutePath(ctx.basePath, locale, page);
}

function docRoute(ctx: ShellContext, slug: string): string {
  return routePath(ctx.basePath, [ctx.locale, "docs", slug]);
}

function tr(
  ctx: ShellContext,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
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

  const announcement = docPages.find(
    (page) => page.slug === "announcement" && page.locale === ctx.locale,
  );
  const announcementHtml = announcement
    ? `<div class="site-announcement" role="note" aria-label="${tr(ctx, "shell.announcementLabel")}"><a class="site-announcement__link" href="${docRoute(ctx, "announcement")}">${announcement.title}</a></div>`
    : "";

  return `
    <header class="site-header">
      <input type="checkbox" id="nav-toggle" class="nav-toggle-input sr-only" />
      <div class="site-header__inner">
        <label for="nav-toggle" class="nav-toggle" aria-label="${tr(ctx, "nav.menu")}">${HAMBURGER_ICON}</label>
        <a class="site-header__brand" href="${routeTo(ctx, ctx.locale, "nmt")}">${tr(ctx, BRAND_KEY)}</a>
        <nav class="site-nav" aria-label="${tr(ctx, "nav.menu")}">
          <a class="site-nav__brand" href="${routeTo(ctx, ctx.locale, "nmt")}">${tr(ctx, BRAND_KEY)}</a>
          ${navLinks}
        </nav>
        <details class="locale-menu">
          <summary class="locale-menu__trigger" aria-label="${LOCALE_LABELS[ctx.locale]}">${GLOBE_ICON}</summary>
          <div class="locale-menu__popover">${localeOptions}</div>
        </details>
      </div>
      <label class="nav-scrim" for="nav-toggle" aria-hidden="true"></label>
      ${announcementHtml}
    </header>
  `;
}

export function renderFooter(ctx: ShellContext): string {
  const socialLinks = [
    {
      icon: HOME_ICON,
      label: tr(ctx, "footer.home"),
      href: "https://subs.js.org/",
    },
    { icon: TELEGRAM_ICON, label: "Telegram", href: SOCIAL_LINKS.telegram },
    { icon: GITHUB_ICON, label: "GitHub", href: SOCIAL_LINKS.github },
    { icon: DISCORD_ICON, label: "Discord", href: SOCIAL_LINKS.discord },
    { icon: BLUESKY_ICON, label: "BlueSky", href: SOCIAL_LINKS.bluesky },
  ];

  const legalLinks: { label: string; href: string; external?: boolean }[] = [
    { label: tr(ctx, "footer.terms"), href: docRoute(ctx, "terms") },
    { label: tr(ctx, "footer.privacy"), href: docRoute(ctx, "privacy") },
    { label: tr(ctx, "footer.status"), href: STATUS_URL, external: true },
    { label: tr(ctx, "footer.feedback"), href: docRoute(ctx, "report-issue") },
    { label: tr(ctx, "footer.source"), href: REPO_URL, external: true },
  ];

  const year = new Date().getFullYear();

  return `
    <footer class="site-footer">
      <div class="site-footer__inner">
        <div class="footer-area footer-area--brand">
          <div class="footer-slogan-wrap">
            <span class="footer-brand-title">${tr(ctx, "footer.org")}</span>
            <span class="footer-brand-sub">${tr(ctx, "footer.slogan")}</span>
          </div>
        </div>

        <div class="footer-area footer-area--social">
          <nav class="footer-community" aria-label="${tr(ctx, "footer.community")}">
            ${socialLinks.map((entry) => `<a class="footer-community__link" href="${entry.href}" target="_blank" rel="noopener" aria-label="${entry.label}" title="${entry.label}">${entry.icon}</a>`).join("")}
          </nav>
        </div>

        <div class="footer-area footer-area--links">
          <nav class="footer-links" aria-label="${tr(ctx, "footer.resources")}">
            ${legalLinks.map((entry, index) => `${index > 0 ? `<span class="footer-sep" aria-hidden="true">·</span>` : ""}<a href="${entry.href}"${entry.external ? ` target="_blank" rel="noopener"` : ""}>${entry.label}</a>`).join("")}
          </nav>
        </div>

        <div class="footer-area footer-area--copyright">
          <div class="footer-copyright-wrap">
            <span class="footer-copyright-text">© ${year} MontageSubs</span>
            <span class="footer-sep" aria-hidden="true">·</span>
            <span class="footer-version">Subtitle Translator ${__APP_VERSION__}</span>
            <span class="footer-sep" aria-hidden="true">·</span>
            <a class="footer-license-badge" href="${REPO_URL}/blob/main/LICENSE" target="_blank" rel="noopener">MIT License</a>
          </div>
        </div>
      </div>
    </footer>
  `;
}
