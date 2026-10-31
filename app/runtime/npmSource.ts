import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { RUNTIME_FILE_NAMES } from "../src/config/runtimeAssets";
import type { Workspace } from "../hosting/localFile";
import { ORT_PACKAGE } from "./ortPackage";

export class NpmRuntimeSource {
  private readonly extracted = new Map<string, string>();

  constructor(private readonly workspace: Workspace) {}

  distDirectory(version: string): string {
    const known = this.extracted.get(version);
    if (known) return known;
    const target = join(this.workspace.directory, `ort-${version}`);
    execFileSync("mkdir", ["-p", target]);
    const archive = execFileSync("npm", ["pack", `${ORT_PACKAGE}@${version}`, "--silent", "--pack-destination", target], { cwd: target, encoding: "utf8" }).trim().split("\n").pop()!;
    execFileSync("tar", ["-xzf", join(target, archive), "-C", target, ...RUNTIME_FILE_NAMES.map((name) => `package/dist/${name}`)]);
    const directory = join(target, "package", "dist");
    this.extracted.set(version, directory);
    return directory;
  }
}
