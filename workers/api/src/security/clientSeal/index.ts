import { noteClientVersion, versionStanding } from "../../http/clientVersion";
import type { RequestContext } from "../../http/context";
import { clientOutdated } from "../../http/responses";
import { MIN_CLIENT_VERSION } from "../../version";
import { parseHello } from "./hello";
import { reportHelloDrift } from "./helloDrift";
import { protocolOf } from "./protocol";
import { retireSeal, verifyHash } from "./registry";

export async function admitSealedClient(rc: RequestContext, body: { clientVersion?: unknown } | null, ipHash: string): Promise<Response | null> {
  noteClientVersion(rc, body?.clientVersion);
  const version = typeof body?.clientVersion === "string" ? body.clientVersion : "";
  const standing = versionStanding(version);
  const refuse = (reason: string): Response => clientOutdated(rc, MIN_CLIENT_VERSION, reason, ipHash);

  if (standing === "malformed") return refuse("client_version_malformed");
  if (standing === "unsupported") {
    retireSeal(rc, version);
    return refuse("client_outdated");
  }
  const protocol = protocolOf(version);
  if (protocol === null) return refuse("protocol_unknown");
  const hello = parseHello(body);
  if (!hello) return refuse("hello_invalid");
  const seal = await verifyHash(rc, version, hello.hash);
  if (!seal) return refuse("hash_mismatch");
  await reportHelloDrift(rc, protocol, seal, hello, ipHash);
  return null;
}
