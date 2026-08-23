import { PAGE_IDS, PageId, Route, buildPath } from "./router";
import { LOCALES, TranslationKey, t } from "./i18n";
import { LOCALE_LABELS } from "./localeLabels";
const NAV_LABEL_KEYS: Record<PageId, TranslationKey> = {
  nmt: "nav.nmt",
  history: "nav.history",
  discussions: "nav.discussions",
  docs: "nav.docs",
  contributors: "nav.contributors",
  about: "nav.about",
};

const GLOBE_ICON = `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
  <circle cx="10" cy="10" r="8" />
  <ellipse cx="10" cy="10" rx="3.2" ry="8" />
  <path d="M2 10h16" />
</svg>`;

const HAMBURGER_ICON = `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
  <path d="M3 6h14M3 10h14M3 14h14" />
</svg>`;

export interface ShellHandle {
  outlet: HTMLElement;
  update: (route: Route) => void;
}

export function mountShell(root: HTMLElement): ShellHandle {
  root.innerHTML = `
    <header class="site-header">
      <div class="site-header__inner">
        <a class="site-header__brand" id="site-brand" href="#">Subtitle Translator</a>
        <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="${t("nav.menu")}">
          ${HAMBURGER_ICON}
        </button>
        <nav class="site-nav" id="site-nav"></nav>
        <div class="locale-menu" id="locale-menu">
          <button type="button" class="locale-menu__trigger" id="locale-menu-trigger" aria-haspopup="true" aria-expanded="false">
            ${GLOBE_ICON}
          </button>
          <div class="locale-menu__popover" id="locale-menu-popover" hidden></div>
        </div>
      </div>
    </header>
    <div class="shell"><div id="page-outlet"></div></div>
  `;

  const brandEl = root.querySelector<HTMLAnchorElement>("#site-brand")!;
  const navEl = root.querySelector<HTMLElement>("#site-nav")!;
  const navToggle = root.querySelector<HTMLButtonElement>("#nav-toggle")!;
  const outlet = root.querySelector<HTMLElement>("#page-outlet")!;
  const menu = root.querySelector<HTMLElement>("#locale-menu")!;
  const trigger = root.querySelector<HTMLButtonElement>("#locale-menu-trigger")!;
  const popover = root.querySelector<HTMLElement>("#locale-menu-popover")!;

  function closeNav(): void {
    navEl.classList.remove("site-nav--open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  navToggle.addEventListener("click", () => {
    const willOpen = !navEl.classList.contains("site-nav--open");
    navEl.classList.toggle("site-nav--open", willOpen);
    navToggle.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (e) => {
    if (!navEl.contains(e.target as Node) && !navToggle.contains(e.target as Node)) closeNav();
  });

  function closeLocaleMenu(): void {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", () => {
    const willOpen = popover.hidden;
    popover.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target as Node)) closeLocaleMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeLocaleMenu(); closeNav(); } });

  function update(route: Route): void {
    brandEl.href = buildPath(route.locale, "nmt");
    closeNav();

    navEl.innerHTML = PAGE_IDS.map((page) => {
      const active = page === route.page ? " site-nav__link--active" : "";
      return `<a class="site-nav__link${active}" href="${buildPath(route.locale, page)}">${t(NAV_LABEL_KEYS[page])}</a>`;
    }).join("");
    navEl.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));

    popover.innerHTML = LOCALES.map((locale) => {
      const active = locale === route.locale ? " locale-menu__option--active" : "";
      return `<a class="locale-menu__option${active}" href="${buildPath(locale, route.page, route.rest)}">${LOCALE_LABELS[locale]}</a>`;
    }).join("");
    popover.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeLocaleMenu));
    closeLocaleMenu();
  }

  return { outlet, update };
}
