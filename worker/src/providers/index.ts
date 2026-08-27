import { TranslationProvider } from "./types";
import { GoogleNmtPaProvider } from "./google-nmt-pa";
import { GoogleNmtV2Provider } from "./google-nmt-v2";
import { DeepLProvider } from "./deepl";

const DEFAULT_PROVIDER = "google-nmt-pa";

const REGISTRY: Record<string, () => TranslationProvider> = {
  "google-nmt-pa": () => new GoogleNmtPaProvider(),
  "google-nmt-v2": () => new GoogleNmtV2Provider(),
  deepl: () => new DeepLProvider(),
};

export function getProvider(name: string): TranslationProvider {
  const factory = REGISTRY[name];
  if (!factory) throw new Error(`Unsupported translation provider: ${name}`);
  return factory();
}

export { DEFAULT_PROVIDER };
