import { STORAGE_KEYS } from "../config/storage";
import { persistentStorage } from "../utils/safeStorage";
import { isVersionAtLeast } from "../utils/version";

export const readRequiredVersion = (): string | null => persistentStorage.readJson<string>(STORAGE_KEYS.requiredVersion);

export const clearRequiredVersion = (): void => persistentStorage.removeItem(STORAGE_KEYS.requiredVersion);

export function rememberRequiredVersion(version: string): void {
  if (!isVersionAtLeast(readRequiredVersion(), version)) persistentStorage.writeJson(STORAGE_KEYS.requiredVersion, version);
}
