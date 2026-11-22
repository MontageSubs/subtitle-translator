import { versionStanding, type VersionStanding } from "../../http/clientVersion";
import type { RequestContext } from "../../http/context";
import { clientOutdated } from "../../http/responses";
import { MIN_CLIENT_VERSION } from "../../version";
import type { Admission } from "../admission";
import { inspectHello } from "./drift";
import { parseHello, type Hello } from "./hello";
import { protocolOf } from "./protocol";
import { deriveSeal, hashMatches, rememberedSeal, rememberSeal, sealHash } from "./seal";

export interface HandshakeClaim {
  version: string;
  standing: VersionStanding;
  protocol: number | null;
  hello: Hello | null;
}

export function readHandshakeClaim(body: { clientVersion?: unknown } | null): HandshakeClaim {
  const version = typeof body?.clientVersion === "string" ? body.clientVersion : "";
  const standing = versionStanding(version);
  const supported = standing === "supported";
  return { version, standing, protocol: supported ? protocolOf(version) : null, hello: supported ? parseHello(body) : null };
}

export const sealLookupFor = ({ version, protocol, hello }: HandshakeClaim): string | undefined =>
  protocol !== null && hello && !rememberedSeal(version) ? version : undefined;

export async function admitSealedClient(rc: RequestContext, admission: Admission, claim: HandshakeClaim): Promise<Response | null> {
  const { ipHash, ledger, storedSeal } = admission;
  const { version, standing, protocol, hello } = claim;
  const refuse = (reason: string): Response => clientOutdated(rc, MIN_CLIENT_VERSION, reason, ipHash);

  if (standing === "malformed") return refuse("client_version_malformed");
  if (standing === "unsupported") return refuse("client_outdated");
  if (protocol === null) return refuse("protocol_unknown");
  if (!hello) return refuse("hello_invalid");

  const known = rememberedSeal(version) ?? storedSeal;
  const seal = known ?? (await deriveSeal(rc.env.BUILD_SEAL_KEY, version));
  if (!hashMatches(seal, hello.hash)) return refuse(`hash_mismatch hash=${hello.hash} expected_hash=${sealHash(seal)}`);
  rememberSeal(version, seal);
  if (!known) ledger.persistSeal(version, seal);
  await inspectHello(rc, admission, protocol, seal, hello);
  return null;
}
