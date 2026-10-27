import { MODEL_HUB_ORIGIN } from "../../config/models";

const REVISION_HEADER = "X-Repo-Commit";
const PROBE_FILE = "config.json";
const PROBE_BRANCH = "main";

export async function fetchLatestRevision(repository: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${MODEL_HUB_ORIGIN}/${repository}/resolve/${PROBE_BRANCH}/${PROBE_FILE}`, { method: "HEAD", cache: "no-store", signal });
  const revision = response.headers.get(REVISION_HEADER);
  if (!response.ok || !revision) throw new Error("revision_unavailable");
  return revision;
}
