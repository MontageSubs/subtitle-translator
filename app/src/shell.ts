import { Route } from './router/router';
import { renderHeader, renderFooter, announcementNotice } from "./render/shellMarkup";
import { mountNoticeBanner, setAnnouncementNotice } from "./components/noticeBanner";

export interface ShellHandle {
  outlet: HTMLElement;
  update: (route: Route) => void;
}

const OPEN_MENU_SELECTOR = ".locale-menu[open], .sort-menu details[open]";
const NAV_LINK_SELECTOR = ".site-nav a, .locale-menu__popover a";

function closeNav(): void {
  const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

function closeMenus(except?: Node): void {
  document.querySelectorAll<HTMLDetailsElement>(OPEN_MENU_SELECTOR).forEach((menu) => {
    if (!except || !menu.contains(except)) menu.open = false;
  });
}

function replaceOrInsert(selector: string, html: string, insert: () => void): void {
  const existing = document.querySelector(selector);
  if (existing) existing.outerHTML = html.trim();
  else insert();
}

export function mountShell(root: HTMLElement): ShellHandle {
  if (!root.querySelector(".shell") || !root.querySelector("#page-outlet")) {
    root.insertAdjacentHTML("beforeend", `<div class="shell"><main id="page-outlet"></main></div>`);
  }
  const shell = root.querySelector<HTMLElement>(".shell")!;
  const outlet = root.querySelector<HTMLElement>("#page-outlet")!;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    closeMenus(target);
    if (target.closest(NAV_LINK_SELECTOR)) {
      closeNav();
      closeMenus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeNav();
    closeMenus();
  });

  function update(route: Route): void {
    closeNav();
    closeMenus();
    const ctx = { locale: route.locale, page: route.page, basePath: import.meta.env.BASE_URL, rest: route.rest };
    const headerHtml = renderHeader(ctx);
    const footerHtml = renderFooter(ctx);
    replaceOrInsert(".site-header", headerHtml, () => shell.insertAdjacentHTML("beforebegin", headerHtml));
    replaceOrInsert(".site-footer", footerHtml, () => shell.insertAdjacentHTML("afterend", footerHtml));
    mountNoticeBanner(shell);
    setAnnouncementNotice(announcementNotice(ctx));
  }

  return { outlet, update };
}
