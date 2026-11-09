import type { RequestContext } from "../http/context";
import { verificationFailed } from "../http/responses";
import { settingsFor } from "../config/settings";
import { trace } from "../logging/trace";
import { clientIp, hashIp } from "./identity";
import { quarantineInBackground } from "./gate";

const BLOCK_SCORE = 4;
const SCORE_MISSING_USER_AGENT = 5;
const SCORE_BLOCKED_USER_AGENT = 5;
const SCORE_BARE_BROWSER_USER_AGENT = 3;
const SCORE_JSON_CONTENT_TYPE = 3;
const SCORE_OTHER_CONTENT_TYPE = 2;
const SCORE_MISSING_ACCEPT_LANGUAGE = 1;
const MIN_PLAUSIBLE_USER_AGENT_CHARS = 20;
const EXPECTED_CONTENT_TYPE = "text/plain";
const JSON_CONTENT_TYPE_MARKER = "json";

interface Signal {
  cause: string;
  score: number;
}

function userAgentSignal(userAgent: string, blocked: readonly string[]): Signal | null {
  if (!userAgent) return { cause: "ua_missing", score: SCORE_MISSING_USER_AGENT };
  const normalized = userAgent.toLowerCase();
  for (const token of blocked) if (normalized.includes(token)) return { cause: "ua_blocklist", score: SCORE_BLOCKED_USER_AGENT };
  return userAgent.length < MIN_PLAUSIBLE_USER_AGENT_CHARS ? { cause: "ua_too_short", score: SCORE_BARE_BROWSER_USER_AGENT } : null;
}

function contentTypeSignal(contentType: string): Signal | null {
  if (contentType.startsWith(EXPECTED_CONTENT_TYPE)) return null;
  return contentType.includes(JSON_CONTENT_TYPE_MARKER) ? { cause: "content_type_json", score: SCORE_JSON_CONTENT_TYPE } : { cause: "content_type_other", score: SCORE_OTHER_CONTENT_TYPE };
}

function handshakeSignals(request: Request, blockedUserAgents: readonly string[]): Signal[] {
  const { headers } = request;
  const signals = [userAgentSignal(headers.get("User-Agent") || "", blockedUserAgents), contentTypeSignal((headers.get("Content-Type") || "").toLowerCase())];
  if (!headers.get("Accept-Language")) signals.push({ cause: "accept_language_missing", score: SCORE_MISSING_ACCEPT_LANGUAGE });
  return signals.filter((signal): signal is Signal => signal !== null);
}

export async function screenHandshake(rc: RequestContext): Promise<Response | null> {
  const { env, request, ctx } = rc;
  const signals = handshakeSignals(request, settingsFor(env).blockedUserAgents);
  const score = signals.reduce((sum, signal) => sum + signal.score, 0);
  if (score < BLOCK_SCORE) return null;
  const causes = signals.map((signal) => signal.cause).join(",");
  const ipHash = await hashIp(env, clientIp(request));
  quarantineInBackground(ctx, env, ipHash, Date.now());
  trace(1, "security", "HANDSHAKE_SCREEN_FAILED", `Request headers failed handshake screen causes=${causes} score=${score} -> quarantined`, ipHash);
  return verificationFailed(rc, `handshake_screen causes=${causes}`, ipHash);
}
