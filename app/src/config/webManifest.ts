import { localeDirection } from "../i18n/locales.config";
import type { LocaleCode } from "../i18n/locales.config";
import { joinPath, routePath } from "../render/paths";

const THEME_COLOR = "#faf9f6";
const ICON_SIZES = [192, 512] as const;
const ICON_PURPOSES = ["any", "maskable"] as const;

export interface WebManifestText {
  name: string;
  short_name: string;
  description: string;
}

export const manifestFileName = (locale: LocaleCode): string => `manifest.${locale}.webmanifest`;

export function buildWebManifest(locale: LocaleCode, basePath: string, text?: Partial<WebManifestText>) {
  const scope = basePath.replace(/\/?$/, "/");
  return {
    id: scope,
    name: text?.name || "Montage Subtitle Translator",
    short_name: text?.short_name || "Montage Subtitle Translator",
    description: text?.description || "Translate subtitle files in your browser with neural machine translation. Bilingual or translation-only output.",
    lang: locale,
    dir: localeDirection(locale),
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
