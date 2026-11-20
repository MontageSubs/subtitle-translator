import { Route } from './router/router';
import { renderHeader, renderFooter } from "./render/shellMarkup";
import { syncStatusLinks } from "./lib/net/statusSources";
import { isCompactLayout, measureCompactLayout, mountCompactLayout } from "./utils/compactLayout";
import { mountNoticeBanner, setBannerLocale } from "./components/noticeBanner";
import { closeLocaleMenu } from "./components/localeMenu";
import { prefersTouchInput } from "./utils/touchInput";
import { TOUCH_MEDIA_QUERY } from "./config/viewport";

export interface ShellHandle {
  outlet: HTMLElement;
  update: (route: Route) => void;
}

const OPEN_MENU_SELECTOR = ".sort-menu details[open]";
const NAV_LINK_SELECTOR = ".site-nav a, .locale-menu__option:not([hreflang])";
const BACKGROUND_SELECTOR = ".shell, .site-footer";
const HEADER_CONTROL_SELECTOR = ".site-header > .skip-link, .site-header > .nav-toggle-input, .site-header__inner > *";
const LOCALE_MENU_EDGE_PX = 8;

function closeNav(): void {
  const toggle = navToggle();
  if (toggle) toggle.checked = false;
  syncBackgroundInert();
}

function navToggle(): HTMLInputElement | null {
  return document.getElementById("nav-toggle") as HTMLInputElement | null;
}

function localeToggle(): HTMLInputElement | null {
  return document.getElementById("locale-toggle") as HTMLInputElement | null;
}

function syncBackgroundInert(): void {
  const navOpen = navToggle()?.checked === true;
  const overlayOpen = navOpen || localeToggle()?.checked === true;
  const contained = (isCompactLayout() || prefersTouchInput()) && overlayOpen;
  document.querySelectorAll(BACKGROUND_SELECTOR).forEach((region) => region.toggleAttribute("inert", contained));
  const keep = navOpen ? ".site-nav, .nav-toggle-input" : ".locale-menu";
  document.querySelectorAll(HEADER_CONTROL_SELECTOR).forEach((control) => control.toggleAttribute("inert", contained && !control.matches(keep)));
}

const DRAWER_STOP_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function openDrawer(): { toggle: HTMLInputElement; content: HTMLElement } | null {
  if (!(isCompactLayout() || prefersTouchInput())) return null;
  const nav = navToggle();
  const locale = localeToggle();
  const content = nav?.checked ? document.getElementById("site-nav") : locale?.checked ? document.getElementById("locale-popover") : null;
  const toggle = nav?.checked ? nav : locale?.checked ? locale : null;
  return toggle && content ? { toggle, content } : null;
}

function trapDrawerFocus(event: KeyboardEvent): void {
  const drawer = openDrawer();
  if (!drawer) return;
  const visible = (element: HTMLElement): boolean => element.getClientRects().length > 0;
  const stops = [drawer.toggle, ...drawer.content.querySelectorAll<HTMLElement>(DRAWER_STOP_SELECTOR)].filter(visible);
  const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
  if (document.activeElement !== edge) return;
  event.preventDefault();
  (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
}

function closeMenus(except?: Node): void {
  document.querySelectorAll<HTMLDetailsElement>(OPEN_MENU_SELECTOR).forEach((menu) => {
    if (!except || !menu.contains(except)) menu.open = false;
  });
}

function fitLocaleMenu(): void {
  const menu = document.querySelector<HTMLElement>(".locale-menu");
  if (!menu) return;
  menu.classList.remove("locale-menu--compact");
  if (localeToggle()?.checked !== true) return;
  const popover = menu.querySelector<HTMLElement>(".locale-menu__popover");
  const bounds = menu.getBoundingClientRect();
  const room = document.documentElement.dir === "rtl" ? window.innerWidth - bounds.left : bounds.right;
  if (popover && popover.getBoundingClientRect().width > room - LOCALE_MENU_EDGE_PX) {
    menu.classList.add("locale-menu--compact");
  }
}

function replaceOrInsert(selector: string, html: string, insert: () => void): void {
  const existing = document.querySelector(selector);
  if (existing) existing.outerHTML = html.trim();
  else insert();
}

function localizeFooterYear(): void {
  const year = String(new Date().getFullYear());
  document.querySelectorAll("[data-footer-year]").forEach((element) => {
    element.textContent = year;
  });
}

export function mountShell(root: HTMLElement): ShellHandle {
  if (!root.querySelector(".shell") || !root.querySelector("#page-outlet")) {
    root.insertAdjacentHTML("beforeend", `<div class="shell"><main id="page-outlet" tabindex="-1"></main></div>`);
  }
  const shell = root.querySelector<HTMLElement>(".shell")!;
  const outlet = root.querySelector<HTMLElement>("#page-outlet")!;

  mountCompactLayout();
  document.addEventListener("touchstart", () => {}, { passive: true });
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    closeMenus(target);
    if (target.closest(NAV_LINK_SELECTOR)) {
      closeNav();
      closeLocaleMenu();
      closeMenus();
    }
  });
  document.addEventListener("change", (event) => {
    const id = (event.target as HTMLElement).id;
    if (id === "nav-toggle" && navToggle()?.checked) closeLocaleMenu();
    if (id === "locale-toggle" && localeToggle()?.checked) {
      const nav = navToggle();
      if (nav) nav.checked = false;
    }
    if (id === "nav-toggle" || id === "locale-toggle") {
      fitLocaleMenu();
      syncBackgroundInert();
    }
  });
  window.addEventListener("resize", () => {
    fitLocaleMenu();
    syncBackgroundInert();
  });
  window.matchMedia(TOUCH_MEDIA_QUERY).addEventListener("change", fitLocaleMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      trapDrawerFocus(event);
      return;
    }
    if (event.key !== "Escape") return;
    const openMenu = document.querySelector<HTMLDetailsElement>(OPEN_MENU_SELECTOR);
    const returnTarget = openMenu?.querySelector<HTMLElement>("summary") ?? (localeToggle()?.checked ? localeToggle() : navToggle()?.checked ? navToggle() : null);
    closeNav();
    closeLocaleMenu();
    closeMenus();
    returnTarget?.focus();
  });

  function update(route: Route): void {
    closeNav();
    closeLocaleMenu();
    closeMenus();
    const ctx = { locale: route.locale, page: route.page, basePath: import.meta.env.BASE_URL, rest: route.rest };
    const headerHtml = renderHeader(ctx);
    const footerHtml = renderFooter(ctx);
    replaceOrInsert(".site-header", headerHtml, () => shell.insertAdjacentHTML("beforebegin", headerHtml));
    replaceOrInsert(".site-footer", footerHtml, () => shell.insertAdjacentHTML("afterend", footerHtml));
    localizeFooterYear();
    syncStatusLinks();
    measureCompactLayout();
    mountNoticeBanner(shell);
    setBannerLocale(ctx.locale);
  }

  return { outlet, update };
}
