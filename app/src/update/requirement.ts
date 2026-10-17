import { persistentStorage } from "../utils/safeStorage";
import { isVersionAtLeast } from "../utils/version";

const STORAGE_KEY = "subtitle-translator:required-version";

export const readRequiredVersion = (): string | null => persistentStorage.readJson<string>(STORAGE_KEY);

export const clearRequiredVersion = (): void => persistentStorage.removeItem(STORAGE_KEY);

export function rememberRequiredVersion(version: string): void {
  if (!isVersionAtLeast(readRequiredVersion(), version)) persistentStorage.writeJson(STORAGE_KEY, version);
}
