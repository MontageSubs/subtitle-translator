import { descriptorNameOf, partPathOf, type PartsDescriptor } from "../src/config/assetLayout";
import { contentTypeOf, type DeploymentEntry } from "./deployment";
import type { DescribedFile } from "./localFile";

export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>;

export function descriptorOf(name: string, file: DescribedFile, partPrefix = ""): PartsDescriptor {
  const count = file.parts.length;
  return { schema: 1, bytes: file.bytes, sha256: file.sha256, parts: file.parts.map((part, index) => ({ path: `${partPrefix}${partPathOf(name, index, count)}`, bytes: part.bytes, sha256: part.sha256 })) };
}

export function partEntries(directory: string, name: string, file: DescribedFile, read: RangeReader): DeploymentEntry[] {
  let offset = 0;
  return file.parts.map((part, index) => {
    const start = offset;
    offset += part.bytes;
    const path = `${directory}/${partPathOf(name, index, file.parts.length)}`;
    return { path, hash: part.pages, contentType: contentTypeOf(path), size: part.bytes, load: () => read(start, part.bytes) };
  });
}

export const descriptorPathOf = (directory: string, name: string): string => `${directory}/${descriptorNameOf(name)}`;
