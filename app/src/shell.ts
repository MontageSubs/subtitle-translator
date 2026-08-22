import { PAGE_IDS, PageId, Route, buildPath } from "./router";
import { LocaleCode, LOCALES, TranslationKey, t } from "./i18n";
import { openHistoryPanel } from "./components/historyPanel";

const LOCALE_LABELS: Record<LocaleCode, string> = { "zh-Hans": "简体", "zh-Hant": "繁體", en: "EN" };
const NAV_LABEL_KEYS: Record<PageId, TranslationKey> = {
  nmt: "nav.nmt",
  docs: "nav.docs",
  about: "nav.about",
  contributors: "nav.contributors",
  discussions: "nav.discussions",
};

export interface ShellHandle {
  outlet: HTMLElement;
  update: (route: Route) => void;
}

export function mountShell(root: HTMLElement): ShellHandle {
  root.innerHTML = `
    <div class="shell">
      <header class="site-header">
        <nav class="site-nav" id="site-nav"></nav>
        <div class="site-header__actions">
          <div class="locale-switch" id="locale-switch"></div>
          <button type="button" class="secondary" id="history-button">${t("history.button")}</button>
        </div>
      </header>
      <div id="page-outlet"></div>
    </div>
  `;

  const navEl = root.querySelector<HTMLElement>("#site-nav")!;
  const localeSwitchEl = root.querySelector<HTMLElement>("#locale-switch")!;
  const outlet = root.querySelector<HTMLElement>("#page-outlet")!;
  root.querySelector<HTMLButtonElement>("#history-button")!.addEventListener("click", () => openHistoryPanel());

  function update(route: Route): void {
    navEl.innerHTML = PAGE_IDS.map((page) => {
      const active = page === route.page ? " site-nav__link--active" : "";
      return `<a class="site-nav__link${active}" href="${buildPath(route.locale, page)}">${t(NAV_LABEL_KEYS[page])}</a>`;
    }).join("");

    localeSwitchEl.innerHTML = LOCALES.map((locale) => {
      const active = locale === route.locale ? " secondary--active" : "";
      return `<a class="secondary${active}" href="${buildPath(locale, route.page, route.rest)}">${LOCALE_LABELS[locale]}</a>`;
    }).join("");
  }

  return { outlet, update };
}
