import { Env } from "./env";
import { nextRingText } from "./secret";

export const ROTATION_CRON = "0 4 * * 7";
const SCRIPT_NAME = "translate";

export async function rotateSecret(env: Env): Promise<void> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    console.error("secret rotation skipped: CF_API_TOKEN/CF_ACCOUNT_ID not configured");
    return;
  }
  const raw = nextRingText(env.WORKER_SECRET);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/secrets`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "WORKER_SECRET", text: raw, type: "secret_text" }),
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`secret rotation failed: ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    return;
  }
  console.log(JSON.stringify({ event: "secret_rotated", ts: Date.now() }));
}
