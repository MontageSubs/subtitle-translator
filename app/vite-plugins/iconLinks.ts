import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APPLE_TOUCH_ICON_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons", "icon-maskable-192.png");

export const appleTouchIconHref = (): string => `data:image/png;base64,${readFileSync(APPLE_TOUCH_ICON_FILE).toString("base64")}`;
