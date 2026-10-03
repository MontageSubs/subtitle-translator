import { LOCALE_DIRECTIONS, translate } from "../i18n/dictionaries";
import type { LocaleCode } from "../i18n/locales.config";
import { joinPath, routePath } from "../render/paths";

const THEME_COLOR = "#0f172a";
const ICON_SIZES = [192, 512] as const;
const ICON_PURPOSES = ["any", "maskable"] as const;

export const manifestFileName = (locale: LocaleCode): string => `manifest.${locale}.webmanifest`;

export function buildWebManifest(locale: LocaleCode, basePath: string) {
  const scope = basePath.replace(/\/?$/, "/");
  return {
    id: scope,
    name: translate(locale, "brand.name"),
    short_name: translate(locale, "pwa.shortName"),
    description: translate(locale, "pwa.description"),
    lang: locale,
    dir: LOCALE_DIRECTIONS[locale],
    start_url: routePath(basePath, [locale]),
    scope,
    display: "standalone",
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: ICON_PURPOSES.flatMap((purpose) =>
      ICON_SIZES.map((size) => ({
        src: joinPath(basePath, ["icons", purpose === "any" ? `icon-${size}.png` : `icon-${purpose}-${size}.png`]),
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose,
      }))
    ),
  };
}
