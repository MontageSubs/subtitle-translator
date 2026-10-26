import { BETA_ENTRY_ATTRIBUTE, CHANNEL } from "../config/channel";
import { getLocale } from "../i18n";
import { HOME_PAGE_ID, pageRoutePath } from "../render/paths";

const REQUIRED_CLICKS = 5;
const CLICK_WINDOW_MS = 1500;

export function bindBetaEntry(): void {
  let clicks = 0;
  let lastClickAt = Number.NEGATIVE_INFINITY;
  document.addEventListener("click", (event) => {
    if (!(event.target as Element).closest(`[${BETA_ENTRY_ATTRIBUTE}]`)) return;
    clicks = event.timeStamp - lastClickAt <= CLICK_WINDOW_MS ? clicks + 1 : 1;
    lastClickAt = event.timeStamp;
    if (clicks < REQUIRED_CLICKS) return;
    clicks = 0;
    location.assign(pageRoutePath(CHANNEL.entries.beta, getLocale(), HOME_PAGE_ID));
  });
}
