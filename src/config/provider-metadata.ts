import type { AccountConfig } from "./accounts-config";

export type RelayProvider = AccountConfig["provider"];

interface ProviderMetadata {
  readonly displayName: string;
  readonly cliLabel: string;
  readonly defaultBaseUrl: string;
}

export const PROVIDER_METADATA: Record<RelayProvider, ProviderMetadata> = {
  zai: {
    displayName: "Z.AI (GLM)",
    cliLabel: "Z.AI (zai)",
    defaultBaseUrl: "https://api.z.ai/api/anthropic",
  },
  minimax: {
    displayName: "MiniMax",
    cliLabel: "MiniMax (minimax)",
    defaultBaseUrl: "https://api.minimax.io/anthropic",
  },
};

export function isRelayProvider(value: string): value is RelayProvider {
  return value in PROVIDER_METADATA;
}

export function listRelayProviders(): RelayProvider[] {
  return Object.keys(PROVIDER_METADATA) as RelayProvider[];
}

export function getDefaultBaseUrl(provider: RelayProvider): string {
  return PROVIDER_METADATA[provider].defaultBaseUrl;
}

export function getProviderDisplayName(provider: RelayProvider): string {
  return PROVIDER_METADATA[provider].displayName;
}

export function getProviderCliLabel(provider: RelayProvider): string {
  return PROVIDER_METADATA[provider].cliLabel;
}
