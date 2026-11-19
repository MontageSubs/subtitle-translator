import { createHmac } from "node:crypto";
import type { BuildChannel } from "./channel";

const SEAL_CHARS = 32;

export interface SealedBuild {
  label: string;
  seal: string;
}

export function sealBuild({ version, buildId }: Pick<BuildChannel, "version" | "buildId">, key: string | undefined): SealedBuild {
  const label = `${version}+${buildId}`;
  return { label, seal: key ? createHmac("sha256", key).update(label).digest("hex").slice(0, SEAL_CHARS) : "" };
}
