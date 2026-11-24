import type { RequestContext } from "../../http/context";
import { fingerprint } from "../../support/fingerprint";
import { cacheEntry } from "../../support/cacheEntry";
import { timingSafeEqual } from "../crypto";
import type { Admission } from "../admission";
import { observedLanguages, type Hello } from "./hello";
import type { ClientEnvironment } from "./protocol";
import { expectedMac } from "./seal";

const HELLO_WINDOW_SECONDS = 600;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const MARKER_TTL_SECONDS = 86_400;
const MAX_LOGGED_USER_AGENT_CHARS = 160;
const OBSERVED = "observed";
const PENALIZED = "penalized";

type MacDriftVerdict = typeof OBSERVED | typeof PENALIZED | "repeat";

const markerKey = (ipHash: string, environment: ClientEnvironment, hello: Hello): string =>
  `https://drift.internal/${ipHash}/${fingerprint(environment.ua)}.${fingerprint(hello.lang.join(","))}`;

function formatSignedDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const magnitude = Math.abs(seconds);
  const hours = Math.floor(magnitude / SECONDS_PER_HOUR);
  const minutes = Math.floor((magnitude % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const remainder = magnitude % SECONDS_PER_MINUTE;
  if (hours > 0) return `${sign}${hours}h${minutes}m${remainder}s`;
  if (minutes > 0) return `${sign}${minutes}m${remainder}s`;
  return `${sign}${remainder}s`;
}

async function judgeMacDrift(rc: RequestContext, ipHash: string, environment: ClientEnvironment, hello: Hello): Promise<MacDriftVerdict> {
  const cache = caches.default;
  const key = markerKey(ipHash, environment, hello);
  let stored: string | null = null;
  try {
    const hit = await cache.match(key);
    stored = hit ? await hit.text() : null;
  } catch {
    stored = null;
  }
  if (stored === PENALIZED) return "repeat";
  const verdict = stored === OBSERVED ? PENALIZED : OBSERVED;
  rc.ctx.waitUntil(cache.put(key, cacheEntry(verdict, MARKER_TTL_SECONDS)).catch(() => undefined));
  return verdict;
}

export async function inspectHello(rc: RequestContext, admission: Admission, protocol: number, seal: string, hello: Hello): Promise<void> {
  const environment: ClientEnvironment = { ua: rc.request.headers.get("User-Agent") || "", origin: rc.origin };
  const observedLanguage = observedLanguages(rc.request.headers.get("Accept-Language") || "");
  const clientAheadSeconds = hello.ts - Math.floor(rc.startedAt / 1000);
  if (Math.abs(clientAheadSeconds) > HELLO_WINDOW_SECONDS) rc.notes.push(`ts_skew=${formatSignedDuration(clientAheadSeconds)}`);
  if (hello.lang[0] !== observedLanguage[0]) rc.notes.push(`lang_declared=${hello.lang.join(",")} lang_observed=${observedLanguage.join(",")}`);
  const expected = await expectedMac(seal, protocol, hello, environment);
  if (timingSafeEqual(expected, hello.mac)) return;
  const verdict = await judgeMacDrift(rc, admission.ipHash, environment, hello);
  if (verdict === PENALIZED) admission.ledger.penalize();
  rc.notes.push(`mac_drift=${verdict} mac=${hello.mac} expected_mac=${expected} ua=${JSON.stringify(environment.ua.slice(0, MAX_LOGGED_USER_AGENT_CHARS))}`);
}
