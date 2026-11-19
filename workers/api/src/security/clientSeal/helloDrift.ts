import type { RequestContext } from "../../http/context";
import { writeLine } from "../../logging/line";
import { ipTag } from "../../logging/trace";
import type { Hello } from "./hello";
import { observedLanguages } from "./language";
import type { ClientEnvironment } from "./protocol";
import { macMatches } from "./seal";

const HELLO_WINDOW_SECONDS = 600;
const MAX_LOGGED_CHARS = 160;

const quoted = (value: string): string => JSON.stringify(value.slice(0, MAX_LOGGED_CHARS));

export async function reportHelloDrift(rc: RequestContext, protocol: number, seal: string, hello: Hello, ipHash: string): Promise<void> {
  const environment: ClientEnvironment = { ua: rc.request.headers.get("User-Agent") || "", origin: rc.origin };
  const observedLanguage = observedLanguages(rc.request.headers.get("Accept-Language") || "");
  const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - hello.ts);
  const findings: string[] = [];
  if (skewSeconds > HELLO_WINDOW_SECONDS) findings.push(`ts(skew=${skewSeconds}s)`);
  if (hello.lang[0] !== observedLanguage[0]) findings.push(`lang(declared=${JSON.stringify(hello.lang)} observed=${JSON.stringify(observedLanguage)})`);
  if (!(await macMatches(seal, protocol, hello, environment))) findings.push(`mac(ua=${quoted(environment.ua)} origin=${quoted(environment.origin)})`);
  if (!findings.length) return;
  const tag = ipTag(ipHash);
  writeLine("warn", rc.endpoint, "hello_mismatch", `${tag ? `ip=${tag} ` : ""}client=${rc.clientVersion} ${findings.join(" ")}`);
}
