import { isLocaleCode, loadLocale, rememberLocale } from "../i18n";

export const LOCALE_OPTION_SELECTOR = ".locale-menu__option[hreflang]";

const PREFETCH_INTENT_MS = 150;

let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
let switching = false;

function optionFrom(event: Event): HTMLAnchorElement | null {
  return (event.target as HTMLElement).closest<HTMLAnchorElement>(LOCALE_OPTION_SELECTOR);
}

function prefetch(event: Event): void {
  clearTimeout(prefetchTimer);
  const option = optionFrom(event);
  if (option && isLocaleCode(option.hreflang)) prefetchTimer = setTimeout(loadLocale, PREFETCH_INTENT_MS, option.hreflang);
}

function isPlainPrimaryClick(event: MouseEvent): boolean {
  return event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

function switchLocale(event: MouseEvent): void {
  const option = optionFrom(event);
  if (!option || event.defaultPrevented || !isPlainPrimaryClick(event) || !isLocaleCode(option.hreflang)) return;
  if (switching) {
    event.preventDefault();
    return;
  }
  switching = true;
  option.setAttribute("aria-busy", "true");
  rememberLocale(option.hreflang);
}

function settle(): void {
  switching = false;
  document.querySelector(`${LOCALE_OPTION_SELECTOR}[aria-busy]`)?.removeAttribute("aria-busy");
}

export function mountLocaleMenu(): void {
  document.addEventListener("pointerover", prefetch);
  document.addEventListener("focusin", prefetch);
  document.addEventListener("click", switchLocale);
  window.addEventListener("pageshow", settle);
}
