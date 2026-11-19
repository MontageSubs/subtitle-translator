import { labelAttrs, tipAttr } from "../utils/labelAttrs";
import { CHANNEL_SWITCH_ATTRIBUTE, CHANNEL } from "../config/channel";
import { PRODUCTION_CHANNEL } from "../config/channelProfile";
import { docPages } from "virtual:docs-content";
import { PAGE_IDS, PageId } from "../router/router.pages";
import type { LocaleCode } from "../i18n/locales.config";
import { formatLanguage, languageLabelParts, sortableName } from "../utils/languageNames";
import { LOCALES } from "../i18n/catalog";
import { matchPreferredLocale } from "../i18n/negotiate";
import { TranslationKey, translate } from "../i18n/dictionaries";
import {
  renderExternalLinkIcon,
  GLOBE_ICON,
  HAMBURGER_ICON,
  CLOSE_ICON,
  HOME_ICON,
  TELEGRAM_ICON,
  GITHUB_ICON,
  DISCORD_ICON,
  BLUESKY_ICON,
} from "./icons";
import { BRAND_KEY, NAV_LABEL_KEYS } from "./metaKeys";
import { renderNoticeBanner, NoticeItem, NOTICE_BANNER_ID } from "./noticeBannerMarkup";
import { HOME_PAGE_ID, routePath, pageRoutePath } from "./paths";
import { MAIN_SITE_URL, REPO_URL, SOCIAL_LINKS, telegramInviteFor } from "../config/social";
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
  return `<span class="locale-menu__name">${name}</span>${suffix ? `<span class="locale-menu__native" lang="${locale}">${suffix}</span>` : ""}`;
}

function browserPreferredLocales(): LocaleCode[] {
  if (typeof document === "undefined") return [];
  const preferred: LocaleCode[] = [];
  for (const tag of navigator.languages ?? []) {
    const locale = matchPreferredLocale([tag], LOCALES, "") as LocaleCode | "";
    if (locale && !preferred.includes(locale)) preferred.push(locale);
  }
  return preferred;
}

function localesInMenuGroups(uiLocale: LocaleCode): { preferred: LocaleCode[]; others: LocaleCode[] } {
  const collator = new Intl.Collator(uiLocale);
  const nameOf = (locale: LocaleCode): string => sortableName(languageLabelParts(locale, uiLocale).name, uiLocale);
  const preferred = browserPreferredLocales();
  const others = LOCALES.filter((locale) => !preferred.includes(locale)).sort((a, b) => collator.compare(nameOf(a), nameOf(b)) || collator.compare(a, b));
  return { preferred, others };
}

function renderLocaleOption(ctx: ShellContext, locale: LocaleCode): string {
  const current = locale === ctx.locale;
  return `<a class="locale-menu__option${current ? " locale-menu__option--active" : ""}" href="${localeSwitchRoute(ctx, locale)}" hreflang="${locale}" data-locale-option${current ? ` aria-current="true"` : ""}>${renderLocaleLabel(locale, ctx.locale)}</a>`;
}

function renderLocaleOptions(ctx: ShellContext): string {
  const { preferred, others } = localesInMenuGroups(ctx.locale);
  return [...preferred, ...others].map((locale) => renderLocaleOption(ctx, locale)).join("");
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

const FOOTER_SEPARATOR = `<span class="footer-separator"> </span>`;

export function renderHeader(ctx: ShellContext): string {
  const navLinks = PAGE_IDS.map((page) => {
    const active = page === ctx.page ? " site-nav__link--active" : "";
    const current = page === ctx.page ? ` aria-current="page"` : "";
    return `<a class="site-nav__link${active}" href="${routeTo(ctx, ctx.locale, page)}"${current}>${tr(ctx, NAV_LABEL_KEYS[page])}</a>`;
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
        <div class="locale-menu">
          <input type="checkbox" id="locale-toggle" class="locale-menu__toggle sr-only" aria-controls="locale-popover" ${labelAttrs(`${tr(ctx, "nav.language")}: ${formatLanguage(ctx.locale, ctx.locale)}`)} />
          <label for="locale-toggle" class="locale-menu__trigger" aria-hidden="true" ${tipAttr(`${tr(ctx, "nav.language")}: ${formatLanguage(ctx.locale, ctx.locale)}`)}>${GLOBE_ICON}</label>
          <label for="locale-toggle" class="locale-menu__scrim" aria-hidden="true"></label>
          <div class="locale-menu__popover" id="locale-popover" role="group" aria-labelledby="locale-heading" tabindex="-1">
            <div class="locale-menu__heading" id="locale-heading">${tr(ctx, "nav.language")}</div>
            <div class="locale-menu__search input-with-clear" data-requires-js>
              <input type="search" class="locale-menu__search-input" placeholder="${tr(ctx, "nav.languageSearch")}" aria-label="${tr(ctx, "nav.languageSearch")}" aria-controls="locale-languages" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" />
              <button type="button" class="input-clear-btn locale-menu__clear" ${labelAttrs(tr(ctx, "preview.clearSearch"))}>${CLOSE_ICON}</button>
            </div>
            <p class="locale-menu__status" role="status" aria-live="polite" data-locale-status data-requires-js></p>
            <div class="locale-menu__languages" id="locale-languages" role="group" aria-label="${tr(ctx, "nav.language")}" data-total-label="${tr(ctx, "nav.languageShown", { total: "{total}" })}">${renderLocaleOptions(ctx)}<p class="locale-menu__empty" hidden>${tr(ctx, "nav.languageNone")}</p></div>
            <div class="locale-menu__divider" role="separator"></div>
            <a class="locale-menu__option locale-menu__help" href="${routeTo(ctx, ctx.locale, "contribute")}">${tr(ctx, "nav.helpTranslate")}</a>
          </div>
        </div>
      </div>
      <label for="nav-toggle" class="nav-scrim" aria-hidden="true"></label>
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
      href: MAIN_SITE_URL,
    },
    { icon: TELEGRAM_ICON, label: "Telegram", href: telegramInviteFor("footer") },
    { icon: GITHUB_ICON, label: "GitHub", href: SOCIAL_LINKS.github },
    { icon: DISCORD_ICON, label: "Discord", href: SOCIAL_LINKS.discord },
    { icon: BLUESKY_ICON, label: "BlueSky", href: SOCIAL_LINKS.bluesky },
  ];

  const legalLinks: { label: string; href: string; tip: string; external?: boolean; statusLink?: boolean }[] = [
    { label: tr(ctx, "footer.terms"), href: docRoute(ctx, "terms"), tip: tr(ctx, "tip.terms") },
    { label: tr(ctx, "footer.privacy"), href: docRoute(ctx, "privacy"), tip: tr(ctx, "tip.privacy") },
    { label: tr(ctx, "footer.feedback"), href: docRoute(ctx, "feedback"), tip: tr(ctx, "tip.feedback") },
    { label: tr(ctx, "footer.status"), href: STATUS_URL, tip: tr(ctx, "tip.status"), external: true, statusLink: true },
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
            ${legalLinks.map((entry) => `<a href="${entry.href}" ${tipAttr(entry.tip)}${entry.statusLink ? " data-status-link" : ""}${entry.external ? ` target="_blank" rel="noopener"` : ""}>${entry.label}${entry.external ? newTabIcon : ""}</a>`).join(FOOTER_SEPARATOR)}
          </nav>
        </div>

        <div class="footer-area footer-area--copyright">
          <div class="footer-copyright-wrap">
            <span class="footer-version">Subtitle Translator <button type="button" class="footer-version__check" data-requires-js aria-label="${tr(ctx, "update.check")}: ${__APP_VERSION__}" title="${tr(ctx, "update.check")}">${__APP_VERSION__}</button></span>${FOOTER_SEPARATOR}<span class="footer-copyright-text">© <span data-footer-year>${year}</span> MontageSubs</span>
          </div>
        </div>
      </div>
    </footer>
  `;
}
