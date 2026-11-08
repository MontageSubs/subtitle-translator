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

function userAgentScore(userAgent: string, blocked: readonly string[]): number {
  if (!userAgent) return SCORE_MISSING_USER_AGENT;
  const normalized = userAgent.toLowerCase();
  for (const token of blocked) if (normalized.includes(token)) return SCORE_BLOCKED_USER_AGENT;
  return userAgent.length < MIN_PLAUSIBLE_USER_AGENT_CHARS ? SCORE_BARE_BROWSER_USER_AGENT : 0;
}

function contentTypeScore(contentType: string): number {
  if (contentType.startsWith(EXPECTED_CONTENT_TYPE)) return 0;
  return contentType.includes(JSON_CONTENT_TYPE_MARKER) ? SCORE_JSON_CONTENT_TYPE : SCORE_OTHER_CONTENT_TYPE;
}

export function handshakeRiskScore(request: Request, blockedUserAgents: readonly string[]): number {
  const { headers } = request;
  return userAgentScore(headers.get("User-Agent") || "", blockedUserAgents)
    + contentTypeScore((headers.get("Content-Type") || "").toLowerCase())
    + (headers.get("Accept-Language") ? 0 : SCORE_MISSING_ACCEPT_LANGUAGE);
}

export async function screenHandshake(rc: RequestContext): Promise<Response | null> {
  const { env, request, ctx } = rc;
  if (handshakeRiskScore(request, settingsFor(env).blockedUserAgents) < BLOCK_SCORE) return null;
  const ipHash = await hashIp(env, clientIp(request));
  quarantineInBackground(ctx, env, ipHash, Date.now());
  trace(1, "security", "HANDSHAKE_SCREEN_FAILED", "Request headers failed handshake screen -> quarantined", ipHash);
  return verificationFailed(rc, "handshake_screen", ipHash);
}
