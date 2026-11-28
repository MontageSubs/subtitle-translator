import type { RequestContext } from "../http/context";
import { halt, proceed, type Outcome } from "../http/outcome";
import { accessBlocked, verificationFailed, verificationRequired } from "../http/responses";
import { settingsFor } from "../config/settings";
import { reportFault } from "../logging/fault";
import { trace } from "../logging/trace";
import { identifyClient, type Client } from "./identity";
import { consumeBurst } from "./limiters";
import type { LedgerReadOptions } from "./reputation/ledger";
import type { Gate } from "./reputation/policy";

export interface Admission extends Client {
  gate: Gate;
  storedSeal: string | null;
}

const isFromRiskyAsn = (rc: RequestContext): boolean => {
  const asn = (rc.request as Request & { cf?: { asn?: number } }).cf?.asn;
  return typeof asn === "number" && settingsFor(rc.env).riskyAsns.has(asn);
};

export async function throttleClient(rc: RequestContext): Promise<Outcome<Client>> {
  const client = await identifyClient(rc);
  if (await consumeBurst(rc.env, client.ipHash)) return proceed(client);
  client.ledger.applyInBackground(rc.ctx, () => client.ledger.quarantine("burst_tripped"));
  trace(1, "security", "BURST_TRIPPED", `Burst trip on ${rc.path} -> Escalating quarantine in D1 ip_shield`, client.ipHash);
  return halt(verificationRequired(rc, "burst_tripped", client.ipHash));
}

export async function openGate(rc: RequestContext, client: Client, options: LedgerReadOptions = {}): Promise<Outcome<Admission>> {
  const { ipHash } = client;
  let opening;
  try {
    opening = await client.ledger.open(options);
  } catch (error) {
    reportFault("gate_read_failed", error, ipHash);
    return halt(verificationFailed(rc, "ip_blocked", ipHash));
  }
  const gate = isFromRiskyAsn(rc) ? { ...opening.gate, requireClearance: true } : opening.gate;
  if (gate.blocked) {
    trace(1, "security", "IP_BLOCKED", "Blocked in D1 ip_shield", ipHash);
    return halt(gate.blockedUntil > rc.startedAt ? accessBlocked(rc, gate.blockedUntil, "ip_blocked", ipHash) : verificationFailed(rc, "ip_blocked", ipHash));
  }
  return proceed({ ...client, gate, storedSeal: opening.storedSeal });
}

export async function admitRequest(rc: RequestContext): Promise<Outcome<Admission>> {
  const throttled = await throttleClient(rc);
  return throttled.ok ? openGate(rc, throttled.value, { paSessionToken: true }) : throttled;
}
