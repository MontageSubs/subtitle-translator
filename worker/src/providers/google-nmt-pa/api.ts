import { Env } from "../../env";
import { reportError } from "../../response";
import { coreLog } from "../../core/log";

const UPSTREAM_ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml";
const FALLBACK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BATCH_FANOUT_CONCURRENCY = 6;

export interface UpstreamTranslation {
  translatedHtml: string;
  detectedLang: string | null;
}

const LANG_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

function extractDetectedLang(payload: unknown): string | null {
  const candidate = (payload as any)?.[1]?.[0];
  return typeof candidate === "string" && LANG_CODE_PATTERN.test(candidate) ? candidate : null;
}

function isStrictChrome(ua: string | undefined): boolean {
  if (!ua) return false;
  return ua.includes("Chrome/") && 
         ua.includes("Safari/") && 
         !ua.includes("Edg/") && 
         !ua.includes("OPR/") && 
         !ua.includes("Brave") && 
         !ua.includes("Vivaldi");
}

export async function fetchUpstreamTranslation(
  env: Env, text: string, source: string, target: string, clientUserAgent?: string, signal?: AbortSignal
): Promise<UpstreamTranslation> {
  if (!env.GOOGLE_TRANSLATE_API_KEY) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is required for google-nmt-pa provider");
  }

  const userAgent = isStrictChrome(clientUserAgent) ? clientUserAgent! : FALLBACK_USER_AGENT;
  
  const headers = new Headers({ 
    "Content-Type": "application/json+protobuf", 
    "User-Agent": userAgent,
    "X-Goog-Api-Key": env.GOOGLE_TRANSLATE_API_KEY
  });
  
  const upstreamUrl = new URL(UPSTREAM_ENDPOINT);
  upstreamUrl.searchParams.set("key", env.GOOGLE_TRANSLATE_API_KEY);

  const response = await fetch(upstreamUrl.toString(), {
    method: "POST", headers, body: JSON.stringify([[[text], source, target], "te"]), signal,
  });

  if (!response.ok) throw new Error(`upstream ${response.status}`);
  const payload = (await response.json().catch(() => null)) as unknown;
  const translatedHtml = Array.isArray(payload) ? (payload as any)?.[0]?.[0] : undefined;
  
  if (typeof translatedHtml !== "string") throw new Error("unexpected upstream response shape");
  return { translatedHtml, detectedLang: source === "auto" ? extractDetectedLang(payload) : null };
}

export interface LangResolver {
  note(detected: string | null): void;
  log(message: string): void;
}

export function createLangResolver(onLog?: (message: string) => void): LangResolver & { value: string | null } {
  return {
    value: null as string | null,
    note(this: { value: string | null }, detected: string | null) {
      if (!this.value && detected) this.value = detected;
    },
    log(message: string) {
      coreLog("translate", message);
      onLog?.(message);
    },
  };
}

export async function fanOutTranslations(
  env: Env, texts: string[], source: string, target: string, budgetMs: number, clientUserAgent?: string, resolver?: LangResolver,
  onBatchResolved?: (index: number, html: string | null) => void
): Promise<(string | null)[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  const results: (string | null)[] = new Array(texts.length).fill(null);
  let cursor = 0;
  
  const runWorker = async () => {
    while (cursor < texts.length) {
      const i = cursor++;
      try {
        const upstream = await fetchUpstreamTranslation(env, texts[i], source, target, clientUserAgent, controller.signal);
        results[i] = upstream.translatedHtml;
        resolver?.note(upstream.detectedLang);
        onBatchResolved?.(i, upstream.translatedHtml);
      } catch (e) {
        reportError(`upstream batch ${i} failed`, e);
        onBatchResolved?.(i, null);
      }
    }
  };
  
  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_FANOUT_CONCURRENCY, texts.length) }, runWorker));
  } finally {
    clearTimeout(timer);
  }
  
  return results;
}
