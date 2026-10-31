import { mebibytes } from "../hosting/jobSummary";
import type { Registry } from "./registry";

export type Outcome = "unchanged" | "dry-run" | "deploy";

export function formatSummary(before: Registry, after: Registry, outcome: Outcome, fileCount: number): string {
  const keys = [...new Set([...Object.keys(before.artifacts), ...Object.keys(after.artifacts)])].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const owners = new Map<string, string>();
  const rows = keys.map((key) => {
    const artifact = after.artifacts[key];
    if (!artifact) return `| ${key} | dropped | | |`;
    const uses = Object.entries(artifact.channels).map(([channel, use]) => `${channel} ${use.since}→${use.until ?? "current"}`).join("; ");
    const files = Object.entries(artifact.files)
      .map(([name, file]) => {
        const duplicate = owners.get(file.sha256);
        owners.set(file.sha256, duplicate ?? `${key}/${name}`);
        return `${name} (${mebibytes(file.bytes)}, ${file.parts.length} part${file.parts.length === 1 ? "" : "s"}${duplicate ? `, identical to ${duplicate}` : ""})`;
      })
      .join("<br>");
    return `| ${key} | ${before.artifacts[key] ? "kept" : "new"} | ${uses} | ${files} |`;
  });
  return ["### Runtime assets", `Outcome: **${outcome}** · ${fileCount} files in the deployment`, "", "| Runtime | State | Channels | Files |", "| --- | --- | --- | --- |", ...rows, ""].join("\n");
}
