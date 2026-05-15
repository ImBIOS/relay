/**
 * Provider metadata — backward-compatible wrapper around the provider registry.
 *
 * The RelayProvider type is now `string` to support any provider from the registry.
 * Existing code using the old `"zai" | "minimax" | "copilot"` union will still work
 * since those are valid string values.
 */

import {
  getAllProviders,
  getDefaultBaseUrl as _getDefaultBaseUrl,
  getProviderDisplayName as _getProviderDisplayName,
  getProviderCliLabel as _getProviderCliLabel,
  isKnownProvider,
} from "./provider-registry";

export type RelayProvider = string;

export const PROVIDER_METADATA: Record<string, { displayName: string; cliLabel: string; defaultBaseUrl: string }> = {};
for (const p of getAllProviders()) {
  PROVIDER_METADATA[p.id] = { displayName: p.displayName, cliLabel: p.cliLabel, defaultBaseUrl: p.defaultBaseUrl };
}

export function isRelayProvider(value: string): value is RelayProvider {
  return isKnownProvider(value);
}

export function listRelayProviders(): RelayProvider[] {
  return getAllProviders().map((p) => p.id);
}

export function getDefaultBaseUrl(provider: RelayProvider): string {
  return _getDefaultBaseUrl(provider);
}

export function getProviderDisplayName(provider: RelayProvider): string {
  return _getProviderDisplayName(provider);
}

export function getProviderCliLabel(provider: RelayProvider): string {
  return _getProviderCliLabel(provider);
}
