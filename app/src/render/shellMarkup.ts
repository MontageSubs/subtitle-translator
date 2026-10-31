import { labelAttrs, tipAttr } from "../utils/labelAttrs";
import { CHANNEL_SWITCH_ATTRIBUTE, CHANNEL } from "../config/channel";
import { PRODUCTION_CHANNEL } from "../config/channelProfile";
import { docPages } from "virtual:docs-content";
import { PAGE_IDS, PageId } from "../router/router.pages";
import type { LocaleCode } from "../i18n/locales.config";
import { formatLanguage, languageLabelParts } from "../utils/languageNames";
import { LOCALES } from "../i18n/catalog";
import { TranslationKey, translate } from "../i18n/dictionaries";
import {
  renderExternalLinkIcon,
  GLOBE_ICON,
  HAMBURGER_ICON,
  HOME_ICON,
  TELEGRAM_ICON,
  GITHUB_ICON,
  DISCORD_ICON,
  BLUESKY_ICON,
} from "./icons";
import { BRAND_KEY, NAV_LABEL_KEYS } from "./metaKeys";
import { renderNoticeBanner, NoticeItem, NOTICE_BANNER_ID } from "./noticeBannerMarkup";
import { HOME_PAGE_ID, routePath, pageRoutePath } from "./paths";
import { REPO_URL, SOCIAL_LINKS } from "../config/social";
import { APP_VERSION } from "../config/compat";
import { ANNOUNCEMENT_SLUG } from "../config/announcement";
import { matchesVersionRange } from "../utils/versionRange";
import { STATUS_URL } from "../config/environment";

export interface ShellContext {
  locale: LocaleCode;
  page: PageId;
  basePath: string;
  rest?: string[];
}

function routeTo(ctx: ShellContext, locale: LocaleCode, page: PageId): string {
  return pageRoutePath(ctx.basePath, locale, page);
}

function localeSwitchRoute(ctx: ShellContext, locale: LocaleCode): string {
  return pageRoutePath(ctx.basePath, locale, ctx.page, ctx.rest);
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

function renderLocaleLabel(locale: LocaleCode, uiLocale: LocaleCode): string {
  const { name, suffix } = languageLabelParts(locale, uiLocale);
  return `<span class="locale-menu__name">${name}</span>${suffix ? `<span class="locale-menu__native">${suffix}</span>` : ""}`;
}

function renderChannelBadge(): string {
  if (CHANNEL.id === PRODUCTION_CHANNEL) return "";
  return `<span class="channel-badge">${CHANNEL.id.toUpperCase()}</span>`;
}

const BRAND_HEART = "❤️";

function renderSlogan(ctx: ShellContext): string {
  const slogan = tr(ctx, "footer.slogan").replaceAll(BRAND_HEART, CHANNEL.heart);
  return `<button type="button" class="footer-brand-sub footer-brand-sub--switch" ${CHANNEL_SWITCH_ATTRIBUTE}>${slogan}</button>`;
}

export function renderHeader(ctx: ShellContext): string {
  const navLinks = PAGE_IDS.map((page) => {
    const active = page === ctx.page ? " site-nav__link--active" : "";
    const current = page === ctx.page ? ` aria-current="page"` : "";
    return `<a class="site-nav__link${active}" href="${routeTo(ctx, ctx.locale, page)}"${current}>${tr(ctx, NAV_LABEL_KEYS[page])}</a>`;
  }).join("");

  const localeOptions = LOCALES.map((locale) => {
    const active = locale === ctx.locale ? " locale-menu__option--active" : "";
    return `<a class="locale-menu__option${active}" href="${localeSwitchRoute(ctx, locale)}" hreflang="${locale}" lang="${locale}">${renderLocaleLabel(locale, ctx.locale)}</a>`;
  }).join("");

  return `
    <header class="site-header">
      <a class="skip-link" href="#page-outlet">${tr(ctx, "a11y.skipToContent")}</a>
      <input type="checkbox" id="nav-toggle" class="nav-toggle-input sr-only" aria-controls="site-nav" aria-label="${tr(ctx, "nav.menu")}" />
      <div class="site-header__inner">
        <label for="nav-toggle" class="nav-toggle" ${tipAttr(tr(ctx, "nav.menu"))}>${HAMBURGER_ICON}<span class="sr-only">${tr(ctx, "nav.menu")}</span></label>
        <a class="site-header__brand" href="${routeTo(ctx, ctx.locale, HOME_PAGE_ID)}">${tr(ctx, BRAND_KEY)}${renderChannelBadge()}</a>
        <nav class="site-nav" id="site-nav" aria-label="${tr(ctx, "nav.menu")}">
          <a class="site-nav__brand" href="${routeTo(ctx, ctx.locale, HOME_PAGE_ID)}">${tr(ctx, BRAND_KEY)}</a>
          ${navLinks}
        </nav>
        <details class="locale-menu">
          <summary class="locale-menu__trigger" ${labelAttrs(`${tr(ctx, "nav.language")}: ${formatLanguage(ctx.locale, ctx.locale)}`)}>${GLOBE_ICON}</summary>
          <div class="locale-menu__popover">${localeOptions}<div class="locale-menu__divider" role="separator"></div><a class="locale-menu__option" href="${routeTo(ctx, ctx.locale, "contribute")}">${tr(ctx, "nav.helpTranslate")}</a></div>
        </details>
      </div>
      <span class="nav-scrim" aria-hidden="true"></span>
    </header>
  `;
}

function bannerNotice(ctx: ShellContext): { items: NoticeItem[]; batchId: string } | null {
  const page = docPages.find((candidate) => candidate.slug === ANNOUNCEMENT_SLUG && candidate.locale === ctx.locale);
  if (!page?.banner || !matchesVersionRange(page.banner.versions, APP_VERSION)) return null;
  return {
    items: [{ tone: page.banner.tone, text: page.title, href: docRoute(ctx, ANNOUNCEMENT_SLUG), label: tr(ctx, "notice.readMore") }],
    batchId: page.bannerId ?? "",
  };
}

export function renderAnnouncementBanner(ctx: ShellContext): string {
  const notice = bannerNotice(ctx);
  if (!notice) return "";
  return renderNoticeBanner({
    id: NOTICE_BANNER_ID,
    ...notice,
    dismissLabel: tr(ctx, "notice.dismiss"),
    newTabLabel: tr(ctx, "a11y.opensInNewTab"),
    ariaLabel: tr(ctx, "notice.announcementLabel"),
  });
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

  const legalLinks: { label: string; href: string; tip: string; external?: boolean }[] = [
    { label: tr(ctx, "footer.terms"), href: docRoute(ctx, "terms"), tip: tr(ctx, "tip.terms") },
    { label: tr(ctx, "footer.privacy"), href: docRoute(ctx, "privacy"), tip: tr(ctx, "tip.privacy") },
    { label: tr(ctx, "footer.status"), href: STATUS_URL, tip: tr(ctx, "tip.status"), external: true },
    { label: tr(ctx, "footer.feedback"), href: docRoute(ctx, "feedback"), tip: tr(ctx, "tip.feedback") },
    { label: tr(ctx, "footer.source"), href: REPO_URL, tip: tr(ctx, "tip.source"), external: true },
  ];

  const year = new Date().getUTCFullYear();
  const newTabIcon = renderExternalLinkIcon(tr(ctx, "a11y.opensInNewTab"));

  return `
    <footer class="site-footer">
      <div class="site-footer__inner">
        <div class="footer-area footer-area--brand">
          <div class="footer-slogan-wrap">
            <span class="footer-brand-title">${tr(ctx, "footer.org")}</span>
            ${renderSlogan(ctx)}
          </div>
        </div>

        <div class="footer-area footer-area--social">
          <nav class="footer-community" aria-label="${tr(ctx, "footer.community")}">
            ${socialLinks.map((entry) => `<a class="footer-community__link" href="${entry.href}" target="_blank" rel="noopener" aria-label="${entry.label}" title="${entry.label}">${entry.icon}</a>`).join("")}
          </nav>
        </div>

        <div class="footer-area footer-area--links">
          <nav class="footer-links" aria-label="${tr(ctx, "footer.resources")}">
            ${legalLinks.map((entry, index) => `${index > 0 ? `<span class="footer-sep" aria-hidden="true">·</span>` : ""}<a href="${entry.href}" ${tipAttr(entry.tip)}${entry.external ? ` target="_blank" rel="noopener"` : ""}>${entry.label}${entry.external ? newTabIcon : ""}</a>`).join("")}
          </nav>
        </div>

        <div class="footer-area footer-area--copyright">
          <div class="footer-copyright-wrap">
            <span class="footer-copyright-text">© <span data-footer-year>${year}</span> MontageSubs</span>
            <span class="footer-sep" aria-hidden="true">·</span>
            <span class="footer-version">Subtitle Translator <button type="button" class="footer-version__check" data-requires-js aria-label="${tr(ctx, "update.check")}: ${__APP_VERSION__}" title="${tr(ctx, "update.check")}">${__APP_VERSION__}</button></span>
            <span class="footer-sep" aria-hidden="true">·</span>
            <a class="footer-license-badge" href="${REPO_URL}/blob/main/LICENSE" target="_blank" rel="noopener" ${tipAttr(tr(ctx, "tip.license"))}>MIT License${newTabIcon}</a>
          </div>
        </div>
      </div>
    </footer>
  `;
}
