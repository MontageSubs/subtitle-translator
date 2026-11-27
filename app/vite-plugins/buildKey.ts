import { createHmac } from "node:crypto";

export const deriveBuildKey = (version: string, secret: string | undefined): string =>
  secret ? createHmac("sha256", secret).update(version).digest("hex") : "";
