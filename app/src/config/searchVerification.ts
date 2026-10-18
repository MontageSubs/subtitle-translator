import { escapeHtml } from "../utils/escapeHtml";

type Env = Record<string, string | undefined>;

const VERIFICATION_META_NAMES: Record<string, string> = {
  VITE_GOOGLE_SITE_VERIFICATION: "google-site-verification",
  VITE_BING_SITE_VERIFICATION: "msvalidate.01",
  VITE_YANDEX_SITE_VERIFICATION: "yandex-verification",
  VITE_BAIDU_SITE_VERIFICATION: "baidu-site-verification",
  VITE_NAVER_SITE_VERIFICATION: "naver-site-verification",
};

export function renderSearchVerificationMeta(env: Env): string {
  return Object.entries(VERIFICATION_META_NAMES)
    .flatMap(([envKey, name]) => {
      const content = env[envKey]?.trim();
      return content ? [`<meta name="${name}" content="${escapeHtml(content)}" />`] : [];
    })
    .join("\n    ");
}
