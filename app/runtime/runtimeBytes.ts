import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNTIME_FILE_NAMES, runtimePart } from "../src/config/runtimeAssets";
import { ORT_PACKAGE, sha256Of } from "./ortPackage";

const keyOf = (version: string, name: string): string => `${version}/${name}`;

export class RuntimeBytes {
  private readonly files = new Map<string, Uint8Array>();

  put(version: string, name: string, bytes: Uint8Array): void {
    this.files.set(keyOf(version, name), bytes);
  }

  obtain(version: string, name: string, expectedSha256: string): Uint8Array {
    const key = keyOf(version, name);
    if (!this.files.has(key)) this.extractFromNpm(version);
    const bytes = this.files.get(key);
    if (!bytes) throw new Error(`${name} is missing from ${ORT_PACKAGE}@${version}`);
    if (sha256Of(bytes) !== expectedSha256) throw new Error(`${name} of ${ORT_PACKAGE}@${version} no longer matches the recorded checksum`);
    return bytes;
  }

  obtainPart(version: string, name: string, expectedSha256: string, index: number): Uint8Array {
    return runtimePart(this.obtain(version, name, expectedSha256), index);
  }

  private extractFromNpm(version: string): void {
    const workDir = mkdtempSync(join(tmpdir(), "ort-"));
    try {
      const archive = execFileSync("npm", ["pack", `${ORT_PACKAGE}@${version}`, "--silent", "--pack-destination", workDir], { cwd: workDir, encoding: "utf8" }).trim().split("\n").pop()!;
      execFileSync("tar", ["-xzf", join(workDir, archive), "-C", workDir, ...RUNTIME_FILE_NAMES.map((name) => `package/dist/${name}`)]);
      for (const name of RUNTIME_FILE_NAMES) this.put(version, name, readFileSync(join(workDir, "package", "dist", name)));
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}
