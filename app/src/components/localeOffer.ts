import { LOCALE_SWITCH_PROMPTS } from "../i18n/catalog";
import { dismissLocaleOffer, offeredLocale } from "../i18n/localePreference";
import { buildPath, Route } from "../router/router";
import { dismissToast, PERSISTENT, showToast, TOAST_PRIORITY } from "./toast";

const TOAST_KEY = "locale-offer";

export function syncLocaleOffer(route: Route): void {
  const target = offeredLocale(route.locale);
  if (!target) {
    dismissToast(TOAST_KEY);
    return;
  }
  const { message, action, close } = LOCALE_SWITCH_PROMPTS[target];
  showToast({
    key: TOAST_KEY,
    message,
    language: target,
    priority: TOAST_PRIORITY.background,
    durationMs: PERSISTENT,
    action: { label: action, href: buildPath(target, route.page, route.rest) + location.search + location.hash, switchesTo: target },
    closeLabel: close,
    onClose: () => dismissLocaleOffer(target),
  });
}
