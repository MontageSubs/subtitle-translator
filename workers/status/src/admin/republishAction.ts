import { SiteEnv, TursoEnv, resolveTursoConfig } from "../config";
import { PagesEnv } from "../publish/pages";
import { RepublishOptions, RepublishResult, republishSnapshot } from "../publish/republish";
import { persistAdminAction } from "./persistence";
import { AdminAction } from "./routes";
import { applySnapshotAction } from "./snapshotActions";

export async function republishAdminAction(
  env: PagesEnv & SiteEnv & TursoEnv,
  action: AdminAction,
  options?: RepublishOptions,
): Promise<RepublishResult> {
  const turso = resolveTursoConfig(env);
  try {
    return await republishSnapshot(
      env,
      async (snapshot) => {
        await persistAdminAction(action, turso, snapshot);
        return applySnapshotAction(snapshot, action);
      },
      options,
    );
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
