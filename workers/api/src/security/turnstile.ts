import { egressFetch } from "../upstream/egress";

const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(secretKey: string, responseToken: string, remoteIp: string): Promise<boolean> {
  const response = await egressFetch(VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: secretKey, response: responseToken, remoteip: remoteIp }),
  });
  const data = await response.json<{ success?: boolean }>().catch(() => ({ success: false }));
  return Boolean(data.success);
}
