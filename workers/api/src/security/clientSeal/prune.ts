import type { Env } from "../../config/env";
import { versionStanding } from "../../http/clientVersion";
import { deleteSeals, listSealVersions } from "./store";

export async function pruneSeals(env: Env): Promise<number> {
  const versions = await listSealVersions(env.DB);
  return deleteSeals(env.DB, versions.filter((version) => versionStanding(version) !== "supported"));
}
