import { escapeHtml } from "../utils/escapeHtml";
import type { LocaleCode } from "../i18n/locales.config";

type Env = Record<string, string | undefined>;

interface VerificationEngine {
  envKey: string;
  metaName: string;
  locales?: readonly LocaleCode[];
}

const VERIFICATION_ENGINES: readonly VerificationEngine[] = [
  { envKey: "VITE_GOOGLE_SITE_VERIFICATION", metaName: "google-site-verification" },
  { envKey: "VITE_BING_SITE_VERIFICATION", metaName: "msvalidate.01" },
  { envKey: "VITE_YANDEX_SITE_VERIFICATION", metaName: "yandex-verification", locales: ["ru", "uk"] },
  { envKey: "VITE_BAIDU_SITE_VERIFICATION", metaName: "baidu-site-verification", locales: ["zh-Hans"] },
  { envKey: "VITE_NAVER_SITE_VERIFICATION", metaName: "naver-site-verification", locales: ["ko"] },
];

export function renderSearchVerificationMeta(env: Env, locale?: LocaleCode): string {
  return VERIFICATION_ENGINES.flatMap(({ envKey, metaName, locales }) => {
    const content = env[envKey]?.trim();
    const servesLocale = locale === undefined || !locales || locales.includes(locale);
    return content && servesLocale ? [`<meta name="${metaName}" content="${escapeHtml(content)}" />`] : [];
  }).join("\n    ");
}
