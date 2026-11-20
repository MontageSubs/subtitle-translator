import { getLocale, isLocaleCode, rememberLocale } from "../i18n";
import { prefetchLocale } from "../update/localePrefetch";
import { hasUnsavedChanges } from "../lib/unsavedChanges";
import { isCompactLayout } from "../utils/compactLayout";
import { mayFocusTextInput } from "../utils/touchInput";
import { isImeComposing } from "../utils/imeComposition";

export const LOCALE_OPTION_SELECTOR = ".locale-menu__option[hreflang]";

const TOGGLE_SELECTOR = "#locale-toggle";
const SEARCH_SELECTOR = ".locale-menu__search-input";
const VISIBLE_OPTION_SELECTOR = `${LOCALE_OPTION_SELECTOR}:not([data-filtered])`;

let switching = false;
let queryToken = 0;

function toggle(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(TOGGLE_SELECTOR);
}

function popover(): HTMLElement | null {
  return document.getElementById("locale-popover");
}

function searchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
}

function visibleOptions(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>(VISIBLE_OPTION_SELECTOR)];
}

export function closeLocaleMenu(): void {
  const checkbox = toggle();
  if (checkbox?.checked) {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function optionFrom(event: Event): HTMLAnchorElement | null {
  return (event.target as HTMLElement).closest<HTMLAnchorElement>(LOCALE_OPTION_SELECTOR);
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

function prefetchHoveredLocale(event: Event): void {
  const option = optionFrom(event);
  if (option && isLocaleCode(option.hreflang) && option.hreflang !== getLocale()) prefetchLocale(option.hreflang);
}

function setStatus(text: string): void {
  const status = document.querySelector<HTMLElement>("[data-locale-status]");
  if (status) status.textContent = text;
}

async function applyQuery(query: string): Promise<void> {
  const token = ++queryToken;
  const options = [...document.querySelectorAll<HTMLAnchorElement>(LOCALE_OPTION_SELECTOR)];
  const needle = query.trim();
  const empty = document.querySelector<HTMLElement>(".locale-menu__empty");
  const languages = document.querySelector<HTMLElement>(".locale-menu__languages");
  let matched = options;
  if (needle) {
    const { matchesLanguageQuery, stripAccents } = await import("../utils/languageSearch");
    if (token !== queryToken) return;
    const folded = stripAccents(needle);
    matched = options.filter((option) => stripAccents(option.textContent ?? "").includes(folded) || matchesLanguageQuery(option.hreflang, needle));
  }
  const matchedSet = new Set(matched);
  for (const option of options) option.toggleAttribute("data-filtered", !matchedSet.has(option));
  if (empty) empty.hidden = matched.length > 0;
  if (languages) languages.scrollTop = 0;
  if (!needle) setStatus("");
  else if (matched.length === 0) setStatus(empty?.textContent ?? "");
  else setStatus((languages?.dataset.totalLabel ?? "").replace("{total}", String(matched.length)));
}

function resetQuery(): void {
  const input = searchInput();
  if (!input) return;
  input.value = "";
  void applyQuery("");
}

function onToggleChange(): void {
  const checkbox = toggle();
  if (!checkbox) return;
  if (!checkbox.checked) {
    resetQuery();
    return;
  }
  document.querySelector<HTMLElement>(".locale-menu__option--active")?.scrollIntoView({ block: "nearest" });
  const input = searchInput();
  if (input && !isCompactLayout() && mayFocusTextInput()) input.focus({ preventScroll: true });
  else popover()?.focus({ preventScroll: true });
}

function focusNeighbour(current: Element, step: 1 | -1): void {
  const options = visibleOptions();
  const index = options.indexOf(current as HTMLAnchorElement);
  const next = options[index + step];
  if (next) next.focus();
  else if (step === -1) searchInput()?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (isImeComposing(event)) return;
  const target = event.target as HTMLElement;
  if (target.matches(SEARCH_SELECTOR)) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      visibleOptions()[0]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      visibleOptions()[0]?.click();
    }
    return;
  }
  const option = target.closest<HTMLAnchorElement>(LOCALE_OPTION_SELECTOR);
  if (!option) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    focusNeighbour(option, event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const options = visibleOptions();
    options[event.key === "Home" ? 0 : options.length - 1]?.focus();
  }
}

function onInput(event: Event): void {
  if ((event.target as HTMLElement).matches(SEARCH_SELECTOR)) void applyQuery((event.target as HTMLInputElement).value);
}

function onClick(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest(".locale-menu__clear")) return;
  const input = searchInput();
  if (!input) return;
  input.value = "";
  void applyQuery("");
  if (mayFocusTextInput()) input.focus();
}

export function mountLocaleMenu(): void {
  document.addEventListener("click", switchLocale);
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("pointerover", prefetchHoveredLocale);
  document.addEventListener("focusin", prefetchHoveredLocale);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("change", (event) => {
    if ((event.target as HTMLElement).id === "locale-toggle") onToggleChange();
  });
  window.addEventListener("pageshow", settle);
  window.addEventListener("beforeunload", () => {
    if (hasUnsavedChanges()) setTimeout(settle, 0);
  });
}
