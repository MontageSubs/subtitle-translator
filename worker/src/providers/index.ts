import { TranslationProvider } from "./types";
import { GoogleNMTPAProvider } from "./google-nmt-pa";

export function getProvider(name: string): TranslationProvider {
  if (name === "google-nmt-pa") {
    return new GoogleNMTPAProvider();
  }
  throw new Error(`Unsupported translation provider: ${name}`);
}
