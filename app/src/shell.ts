import { Route } from './router/router';
import { renderHeader, renderFooter, announcementNotice } from "./render/shellMarkup";
import { measureCompactLayout, mountCompactLayout } from "./layout/compactLayout";
import { mountNoticeBanner, setAnnouncementNotice } from "./components/noticeBanner";

export interface ShellHandle {
  outlet: HTMLElement;
  update: (route: Route) => void;
}

const OPEN_MENU_SELECTOR = ".locale-menu[open], .sort-menu details[open]";
const NAV_LINK_SELECTOR = ".site-nav a, .locale-menu__option:not([hreflang])";
const LOCALE_MENU_EDGE_PX = 8;

function closeNav(): void {
  const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

function closeMenus(except?: Node): void {
  document.querySelectorAll<HTMLDetailsElement>(OPEN_MENU_SELECTOR).forEach((menu) => {
    if (!except || !menu.contains(except)) menu.open = false;
  });
}

function fitLocaleMenu(menu: HTMLDetailsElement): void {
  menu.classList.remove("locale-menu--compact");
  const popover = menu.querySelector<HTMLElement>(".locale-menu__popover");
  const bounds = menu.getBoundingClientRect();
  const room = document.documentElement.dir === "rtl" ? window.innerWidth - bounds.left : bounds.right;
  if (popover && popover.getBoundingClientRect().width > room - LOCALE_MENU_EDGE_PX) {
    menu.classList.add("locale-menu--compact");
  }
}

function fitOpenLocaleMenus(): void {
  document.querySelectorAll<HTMLDetailsElement>(".locale-menu[open]").forEach(fitLocaleMenu);
}

function replaceOrInsert(selector: string, html: string, insert: () => void): void {
  const existing = document.querySelector(selector);
  if (existing) existing.outerHTML = html.trim();
  else insert();
}

export function mountShell(root: HTMLElement): ShellHandle {
  if (!root.querySelector(".shell") || !root.querySelector("#page-outlet")) {
    root.insertAdjacentHTML("beforeend", `<div class="shell"><main id="page-outlet" tabindex="-1"></main></div>`);
  }
  const shell = root.querySelector<HTMLElement>(".shell")!;
  const outlet = root.querySelector<HTMLElement>("#page-outlet")!;

  mountCompactLayout();
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    closeMenus(target);
    if (target.closest(NAV_LINK_SELECTOR)) {
      closeNav();
      closeMenus();
    }
  });
  document.addEventListener("toggle", fitOpenLocaleMenus, true);
  window.addEventListener("resize", fitOpenLocaleMenus);
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
    measureCompactLayout();
    mountNoticeBanner(shell);
    setAnnouncementNotice(announcementNotice(ctx), ctx.locale);
  }

  return { outlet, update };
}
