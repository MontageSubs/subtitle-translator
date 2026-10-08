import type { TranslationProvider } from "../types";
import { deeplProvider } from "./deepl";
import { googleNmtPaProvider, googleNmtV2Provider } from "./google";
import { microsoftNmtEdgeProvider } from "./microsoft";

const PROVIDERS = new Map<string, TranslationProvider>(
  [googleNmtPaProvider, googleNmtV2Provider, microsoftNmtEdgeProvider, deeplProvider].map((provider) => [provider.id, provider])
);

export const isKnownProvider = (name: string): boolean => PROVIDERS.has(name);

export function getProvider(name: string): TranslationProvider {
  const provider = PROVIDERS.get(name);
  if (!provider) throw new Error(`Unsupported translation provider: ${name}`);
  return provider;
}
