const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const minAgeDays = parseInt(process.env.INPUT_MIN_AGE_DAYS || "7", 10);
const maxAgeDays = parseInt(process.env.INPUT_MAX_AGE_DAYS || "15", 10);

const now = Date.now();
const oneDayMs = 86400000;
const upperDate = new Date(Math.max(0, now - minAgeDays * oneDayMs));
const lowerDate = new Date(Math.max(0, now - maxAgeDays * oneDayMs));
const upperIso = upperDate.toISOString();
const lowerIso = lowerDate.toISOString();
const dateQuery = `${lowerIso.slice(0, 10)}..${upperIso.slice(0, 10)}`;


const baseUrl = "https://api.github.com";
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "PruneActionRetention/1.0"
};

async function executePool(items, concurrency, workerFn) {
  let index = 0;
  const count = items.length;
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (index < count) {
      const item = items[index++];
      await workerFn(item);
    }
  });
  await Promise.all(workers);
}

async function fetchTargetRuns() {
  const runs = [];
  let page = 1;
  while (true) {
    const url = `${baseUrl}/repos/${repo}/actions/runs?status=completed&created=${encodeURIComponent(dateQuery)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Failed to fetch runs (page ${page}): HTTP ${res.status}`);
      break;
    }
    const data = await res.json();
    const batch = data.workflow_runs || [];
    runs.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return runs;
}

async function fetchTargetArtifacts() {
  const artifacts = [];
  let page = 1;
  while (true) {
    const url = `${baseUrl}/repos/${repo}/actions/artifacts?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Failed to fetch artifacts (page ${page}): HTTP ${res.status}`);
      break;
    }
    const data = await res.json();
    const batch = data.artifacts || [];
    for (const art of batch) {
      if (art.expired) continue;
      if (art.created_at >= lowerIso && art.created_at <= upperIso) {
        artifacts.push(art);
      }
    }
    if (batch.length < 100) break;
    page++;
  }
  return artifacts;
}

async function deleteAll(items, urlOf) {
  let pruned = 0;
  await executePool(items, 8, async (item) => {
    try {
      const res = await fetch(urlOf(item), { method: "DELETE", headers });
      if (res.status === 204) pruned++;
    } catch {}
  });
  return pruned;
}

async function main() {
  const artifacts = await fetchTargetArtifacts();
  const prunedArtifacts = await deleteAll(artifacts, (artifact) => `${baseUrl}/repos/${repo}/actions/artifacts/${artifact.id}`);
  const runs = await fetchTargetRuns();
  const prunedRuns = await deleteAll(runs, (run) => `${baseUrl}/repos/${repo}/actions/runs/${run.id}/logs`);
  console.log(`Pruned ${prunedArtifacts}/${artifacts.length} artifacts and ${prunedRuns}/${runs.length} run logs.`);
}

main().catch((err) => {
  console.error("Workflow retention cycle error:", err);
  process.exit(1);
});

