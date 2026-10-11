const PROVIDER_NAMES: Record<string, string> = {
  "google-nmt-pa": "Google",
  "microsoft-nmt-edge": "Microsoft",
};

const DEFAULT_PROVIDER_NAME = "Google";

export function providerName(provider: string | undefined): string {
  return (provider && PROVIDER_NAMES[provider]) || DEFAULT_PROVIDER_NAME;
}
