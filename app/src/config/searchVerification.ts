import { escapeHtml } from "../utils/escapeHtml";

type Env = Record<string, string | undefined>;

const VERIFICATION_ENGINES: readonly { envKey: string; metaName: string }[] = [
  { envKey: "VITE_GOOGLE_SITE_VERIFICATION", metaName: "google-site-verification" },
  { envKey: "VITE_BING_SITE_VERIFICATION", metaName: "msvalidate.01" },
  { envKey: "VITE_YANDEX_SITE_VERIFICATION", metaName: "yandex-verification" },
  { envKey: "VITE_BAIDU_SITE_VERIFICATION", metaName: "baidu-site-verification" },
  { envKey: "VITE_NAVER_SITE_VERIFICATION", metaName: "naver-site-verification" },
];

export function renderSearchVerificationMeta(env: Env): string {
  return VERIFICATION_ENGINES.flatMap(({ envKey, metaName }) => {
    const content = env[envKey]?.trim();
    return content ? [`<meta name="${metaName}" content="${escapeHtml(content)}" />`] : [];
  }).join("\n    ");
}
