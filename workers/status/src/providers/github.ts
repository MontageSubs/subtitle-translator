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
    if (
      result?.platformIndicator === "critical" ||
      result?.platformIndicator === "major" ||
      result?.pageStatus === "major_outage" ||
      result?.actionsStatus === "major_outage"
    )
      return "major_outage";
    if (
      result?.platformIndicator === "minor" ||
      result?.pageStatus === "degraded_performance" ||
      result?.pageStatus === "partial_outage" ||
      result?.actionsStatus === "degraded_performance" ||
      result?.actionsStatus === "partial_outage"
    )
      return "degraded_performance";
    return "operational";
  },
};
