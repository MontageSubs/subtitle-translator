import type { Env } from "../config/env";
import type { RequestContext } from "../http/context";
import { BoundedMap } from "../support/boundedMap";
import { getOrInsert } from "../support/getOrInsert";
import { hmacHex } from "./crypto";
import { ReputationLedger } from "./reputation/ledger";

const MAX_REMEMBERED_ADDRESSES = 256;
const rememberedHashes = new BoundedMap<string, Promise<string>>(MAX_REMEMBERED_ADDRESSES);

export class MissingClientIpError extends Error {
  constructor() {
    super("missing_client_ip");
    this.name = "MissingClientIpError";
  }
}

export interface Client {
  ip: string;
  ipHash: string;
  ledger: ReputationLedger;
}

const hashIp = (env: Env, ip: string): Promise<string> => getOrInsert(rememberedHashes, ip, () => hmacHex(env.PRIVACY_SALT_IP, ip));

export async function identifyClient(rc: RequestContext): Promise<Client> {
  const ip = rc.request.headers.get("CF-Connecting-IP");
  if (!ip) throw new MissingClientIpError();
  const ipHash = await hashIp(rc.env, ip);
  rc.ledger = new ReputationLedger(rc.env, ipHash, rc.startedAt);
  return { ip, ipHash, ledger: rc.ledger };
}
