import type { RequestContext } from "../../http/context";
import { reportFault } from "../../logging/fault";
import { deriveSeal, hashMatches } from "./seal";
import { deleteSeal, loadSeal, saveSeal } from "./store";

const MAX_REMEMBERED_SEALS = 64;
const remembered = new Map<string, string>();

function remember(version: string, seal: string): void {
  if (remembered.size >= MAX_REMEMBERED_SEALS && !remembered.has(version)) remembered.delete(remembered.keys().next().value!);
  remembered.set(version, seal);
}

async function recallSeal(rc: RequestContext, version: string): Promise<string | null> {
  const known = remembered.get(version);
  if (known) return known;
  try {
    return await loadSeal(rc.env.DB, version);
  } catch (error) {
    reportFault("seal_load_failed", error);
    return null;
  }
}

export async function verifyHash(rc: RequestContext, version: string, hash: string): Promise<string | null> {
  const recalled = await recallSeal(rc, version);
  if (recalled) {
    if (!hashMatches(recalled, hash)) return null;
    remember(version, recalled);
    return recalled;
  }
  const derived = await deriveSeal(rc.env.BUILD_SEAL_KEY, version);
  if (!hashMatches(derived, hash)) return null;
  remember(version, derived);
  rc.ctx.waitUntil(saveSeal(rc.env.DB, version, derived).catch((error) => reportFault("seal_save_failed", error)));
  return derived;
}

export function retireSeal(rc: RequestContext, version: string): void {
  remembered.delete(version);
  rc.ctx.waitUntil(deleteSeal(rc.env.DB, version).catch((error) => reportFault("seal_retire_failed", error)));
}
