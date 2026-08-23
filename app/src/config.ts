export const WORKER_URL: string = import.meta.env.VITE_WORKER_URL || "";
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
export const GISCUS_REPO: string = import.meta.env.VITE_GISCUS_REPO || "";
export const GISCUS_REPO_ID: string = import.meta.env.VITE_GISCUS_REPO_ID || "";
export const GISCUS_CATEGORY: string = import.meta.env.VITE_GISCUS_CATEGORY || "";
export const GISCUS_CATEGORY_ID: string = import.meta.env.VITE_GISCUS_CATEGORY_ID || "";

export const REQUEST_TIMEOUT_MS = 45_000;
export const IDLE_STANDBY_MARGIN_MS = 2_000;

export function assertConfigured(): void {
  if (!WORKER_URL) {
    throw new Error("VITE_WORKER_URL 未配置：静态页面需要通过 Worker 转发翻译请求，请在部署环境变量中设置。");
  }
}
