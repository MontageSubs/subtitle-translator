import type { Registry } from "./registry";

export type Outcome = "unchanged" | "dry-run" | "deploy";

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export function formatSummary(before: Registry, after: Registry, outcome: Outcome): string {
  const versions = [...new Set([...Object.keys(before.runtimes), ...Object.keys(after.runtimes)])].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const owners = new Map<string, string>();
  const rows = versions.map((version) => {
    const runtime = after.runtimes[version];
    if (!runtime) return `| ${version} | dropped | | |`;
    const uses = Object.entries(runtime.channels).map(([channel, use]) => `${channel} ${use.since}→${use.until ?? "current"}`).join("; ");
    const files = Object.entries(runtime.files)
      .map(([name, file]) => {
        const duplicate = owners.get(file.sha256);
        owners.set(file.sha256, duplicate ?? `${version}/${name}`);
        return `${name} (${megabytes(file.bytes)}, ${file.pages.length} part${file.pages.length === 1 ? "" : "s"}${duplicate ? `, identical to ${duplicate}` : ""})`;
      })
      .join("<br>");
    return `| ${version} | ${before.runtimes[version] ? "kept" : "new"} | ${uses} | ${files} |`;
  });
  return ["### Runtime assets", `Outcome: **${outcome}**`, "", "| ORT | State | Channels | Files |", "| --- | --- | --- | --- |", ...rows, ""].join("\n");
}
