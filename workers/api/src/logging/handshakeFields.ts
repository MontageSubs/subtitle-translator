import type { Hello } from "../security/clientSeal/hello";
import { joinFields } from "./fields";

const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const ABSENT = "-";

function countryOf(request: Request): string {
  const country = (request as Request & { cf?: { country?: unknown } }).cf?.country;
  return typeof country === "string" && COUNTRY_PATTERN.test(country) ? country : ABSENT;
}

export const describeHandshake = (request: Request, hello: Hello | null): string =>
  joinFields([
    ["geo", countryOf(request)],
    ["tz", hello?.tz ?? ABSENT],
    ["ui", hello?.ui ?? ABSENT],
    ["browser", hello ? hello.lang.join(",") : ABSENT],
  ]);
