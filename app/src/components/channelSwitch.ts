import { CHANNEL, CHANNEL_SWITCH_ATTRIBUTE } from "../config/channel";
import { PRODUCTION_CHANNEL } from "../config/channelProfile";
import { getLocale } from "../i18n";
import { HOME_PAGE_ID, pageRoutePath } from "../render/paths";

const REQUIRED_CLICKS = 5;
const CLICK_WINDOW_MS = 1500;

const counterpartEntry = (): string => CHANNEL.entries[CHANNEL.id === PRODUCTION_CHANNEL ? "beta" : PRODUCTION_CHANNEL];

export function bindChannelSwitch(): void {
  let clicks = 0;
  let lastClickAt = Number.NEGATIVE_INFINITY;
  document.addEventListener("click", (event) => {
    if (!(event.target as Element).closest(`[${CHANNEL_SWITCH_ATTRIBUTE}]`)) return;
    clicks = event.timeStamp - lastClickAt <= CLICK_WINDOW_MS ? clicks + 1 : 1;
    lastClickAt = event.timeStamp;
    if (clicks < REQUIRED_CLICKS) return;
    clicks = 0;
    location.assign(pageRoutePath(counterpartEntry(), getLocale(), HOME_PAGE_ID));
  });
}
