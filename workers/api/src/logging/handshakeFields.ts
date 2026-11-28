import type { Hello } from "../security/clientSeal/hello";
import { joinFields } from "./fields";

const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const COLO_PATTERN = /^[A-Z]{3}$/;
const PLACEMENT_PATTERN = /^(?:local|remote)-[A-Z]{3}$/;
const PLACEMENT_HEADER = "cf-placement";
const ABSENT = "-";

type EdgeRequest = Request & { cf?: { country?: unknown; colo?: unknown } };

const matchedOrAbsent = (value: unknown, pattern: RegExp): string => (typeof value === "string" && pattern.test(value) ? value : ABSENT);

export function describeHandshake(request: Request, hello: Hello | null): string {
  const { cf } = request as EdgeRequest;
  return joinFields([
    ["geo", matchedOrAbsent(cf?.country, COUNTRY_PATTERN)],
    ["colo", matchedOrAbsent(cf?.colo, COLO_PATTERN)],
    ["placement", matchedOrAbsent(request.headers.get(PLACEMENT_HEADER), PLACEMENT_PATTERN)],
    ["tz", hello?.tz ?? ABSENT],
    ["ui", hello?.ui ?? ABSENT],
    ["browser", hello ? hello.lang.join(",") : ABSENT],
  ]);
}
