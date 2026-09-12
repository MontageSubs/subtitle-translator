import { ProviderPlugin } from "./index";
import { pollGitHubStatus, GitHubStatusSummary } from "../upstream";

export const githubPlugin: ProviderPlugin = {
  id: "upstream_github",
  name: "GitHub Platform Infrastructure",
  group: "infrastructure_dependencies",
  referenceUrl: "https://www.githubstatus.com/",
  preFetch: async (env, shared) => {
    if (!shared.has("githubStatus")) {
      shared.set("githubStatus", await pollGitHubStatus().catch(() => null));
    }
  },
  check: async (env, shared) => shared.get("githubStatus"),
  evaluate: (result: GitHubStatusSummary) => {
    const pageStatus = result?.pageStatus || "operational";
    const actionsStatus = result?.actionsStatus || "operational";
    if (pageStatus === "major_outage" || actionsStatus === "major_outage") {
      return "major_outage";
    }
    if (
      pageStatus === "degraded_performance" ||
      pageStatus === "partial_outage" ||
      actionsStatus === "degraded_performance" ||
      actionsStatus === "partial_outage"
    ) {
      return "degraded_performance";
    }
    return "operational";
  },
};
