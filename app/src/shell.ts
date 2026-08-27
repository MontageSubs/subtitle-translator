import { Route } from './router/router';
import { renderHeader, renderFooter } from "./render/shellMarkup";

export interface ShellHandle {
  outlet: HTMLElement;
  update: (route: Route) => void;
}

export function mountShell(root: HTMLElement): ShellHandle {
  root.innerHTML = `<div class="shell"><main id="page-outlet"></main></div>`;
  const shell = root.querySelector<HTMLElement>(".shell")!;
  const outlet = root.querySelector<HTMLElement>("#page-outlet")!;

  const navToggle = () => document.getElementById("nav-toggle") as HTMLInputElement | null;
  const closeNav = () => { const toggle = navToggle(); if (toggle) toggle.checked = false; };
  const closeLocaleMenus = () => { document.querySelectorAll<HTMLDetailsElement>(".locale-menu[open], .sort-menu details[open]").forEach((d) => (d.open = false)); };

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    document.querySelectorAll<HTMLDetailsElement>(".locale-menu[open], .sort-menu details[open]").forEach((d) => {
      if (!d.contains(target)) d.open = false;
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeNav(); closeLocaleMenus(); }
  });

  function update(route: Route): void {
    closeNav();
    closeLocaleMenus();
    const headerHtml = renderHeader({ locale: route.locale, page: route.page, basePath: import.meta.env.BASE_URL });
    const existingHeader = document.querySelector(".site-header");
    const existingFooter = document.querySelector(".site-footer");
    if (existingHeader) existingHeader.outerHTML = headerHtml.trim();
    else shell.insertAdjacentHTML("beforebegin", headerHtml);
    const footerHtml = renderFooter({ locale: route.locale, page: route.page, basePath: import.meta.env.BASE_URL });
    if (existingFooter) existingFooter.outerHTML = footerHtml.trim();
    else shell.insertAdjacentHTML("afterend", footerHtml);

    document.querySelectorAll<HTMLAnchorElement>(".site-nav a, .locale-menu__popover a").forEach((a) => {
      a.addEventListener("click", () => { closeNav(); closeLocaleMenus(); });
    });
  }

  return { outlet, update };
}
