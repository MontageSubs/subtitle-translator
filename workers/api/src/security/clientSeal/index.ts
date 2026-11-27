import { versionStanding, type VersionStanding } from "../../http/clientVersion";
import type { RequestContext } from "../../http/context";
import { clientOutdated } from "../../http/responses";
import { MIN_CLIENT_VERSION } from "../../version";
import type { Admission } from "../admission";
import { inspectHello } from "./drift";
import { parseHello, type Hello } from "./hello";
import { claimDiscrepancy, deriveSeal, helloCarriesHash, protocolOf } from "./protocol";
import { rememberedSeal, rememberSeal } from "./seal";

export interface HandshakeClaim {
  label: string;
  standing: VersionStanding;
  protocol: number | null;
  hello: Hello | null;
}

export function readHandshakeClaim(body: { clientVersion?: unknown } | null): HandshakeClaim {
  const label = typeof body?.clientVersion === "string" ? body.clientVersion : "";
  const standing = versionStanding(label);
  const protocol = standing === "supported" ? protocolOf(label) : null;
  return { label, standing, protocol, hello: protocol === null ? null : parseHello(body, helloCarriesHash(protocol)) };
}

export const sealLookupFor = ({ label, protocol, hello }: HandshakeClaim): string | undefined =>
  protocol !== null && hello && !rememberedSeal(label) ? label : undefined;

export async function admitSealedClient(rc: RequestContext, admission: Admission, claim: HandshakeClaim): Promise<Response | null> {
  const { ipHash, ledger, storedSeal } = admission;
  const { label, standing, protocol, hello } = claim;
  const refuse = (reason: string): Response => clientOutdated(rc, MIN_CLIENT_VERSION, reason, ipHash);

  if (standing === "malformed") return refuse("client_version_malformed");
  if (standing === "unsupported") return refuse("client_outdated");
  if (protocol === null) return refuse("protocol_unknown");
  if (!hello) return refuse("hello_invalid");

  const known = rememberedSeal(label) ?? storedSeal;
  const seal = known ?? (await deriveSeal(protocol, rc.env.BUILD_SEAL_KEY, label));
  const discrepancy = claimDiscrepancy(protocol, seal, label, hello);
  if (discrepancy) return refuse(discrepancy);
  rememberSeal(label, seal);
  if (!known) ledger.persistSeal(label, seal);
  await inspectHello(rc, admission, protocol, seal, hello);
  return null;
}
