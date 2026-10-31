import { appendFileSync } from "node:fs";

export function writeSummary(markdown: string): void {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

export const mebibytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export function readCredentials(projectVariable: string): { accountId: string; apiToken: string; project: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const project = process.env[projectVariable];
  if (!accountId || !apiToken || !project) throw new Error(`CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and ${projectVariable} are required`);
  return { accountId, apiToken, project };
}
