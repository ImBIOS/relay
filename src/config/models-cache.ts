/**
 * Models Cache — user-overridable model definitions.
 *
 * Resolution order for any provider's models:
 *   1. User overrides (manually added via `relay models add`)
 *   2. Cached fetch (from `relay models refresh`, with TTL)
 *   3. Built-in static list (from provider-registry.ts)
 *
 * The cache lives at ~/.config/relay/models.json and is never written
 * by the library code except through explicit save calls.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ModelDefinition } from "./provider-registry";

// ── Types ────────────────────────────────────────────────────────────────────
export interface CachedModels {
  /** ISO timestamp of last full refresh */
  lastRefreshed?: string;
  /** Per-provider cached model lists */
  providers: Record<string, ProviderModelCache>;
}

export interface ProviderModelCache {
  /** Models fetched dynamically from the provider API */
  fetched?: ModelDefinition[];
  /** ISO timestamp of last fetch for this provider */
  fetchedAt?: string;
  /** User-defined models that override/extend the built-in list */
  userOverrides?: ModelDefinition[];
}

// ── Config path (computed at call time for testability) ──────────────────────
function getConfigDir(): string {
  return `${process.env.HOME || process.env.USERPROFILE}/.config/relay`;
}
function computeModelsPath(): string {
  return join(getConfigDir(), "models.json");
}

// ── Cache TTL: 7 days (same as ForgeCode) ────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Cache ────────────────────────────────────────────────────────────────────
let _cache: CachedModels | undefined;
let _cacheMtime = 0;

function emptyCache(): CachedModels {
  return { providers: {} };
}

export function getModelsPath(): string {
  return computeModelsPath();
}

export function loadModelsCache(): CachedModels {
  const modelsPath = computeModelsPath();
  try {
    const stat = statSync(modelsPath);
    if (_cache && stat.mtimeMs === _cacheMtime) {
      return _cache;
    }
    const content = readFileSync(modelsPath, "utf-8");
    const parsed = JSON.parse(content) as CachedModels;
    _cache = { ...emptyCache(), ...parsed, providers: { ...emptyCache().providers, ...(parsed.providers ?? {}) } };
    _cacheMtime = stat.mtimeMs;
    return _cache;
  } catch {
    _cache = emptyCache();
    return _cache;
  }
}

export function saveModelsCache(cache: CachedModels): void {
  const modelsPath = computeModelsPath();
  const dir = dirname(modelsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Atomic write
  const tmpPath = `${modelsPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(cache, null, 2));
  renameSync(tmpPath, modelsPath);

  _cache = cache;
  try {
    _cacheMtime = statSync(modelsPath).mtimeMs;
  } catch {
    // ignore
  }
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolve the effective model list for a provider.
 * Resolution order: user overrides > cached fetch > built-in static.
 *
 * @param providerId Provider ID (e.g. "zai", "copilot")
 * @param builtInModels The built-in static list from provider-registry
 * @param options Control fetch behavior
 */
export function resolveModels(
  providerId: string,
  builtInModels: string | ModelDefinition[],
  options?: {
    /** If true, attempt a live fetch even if cache is fresh */
    forceFetch?: boolean;
    /** Custom fetch function (injected for testability) */
    fetchFn?: (providerId: string, url: string) => Promise<ModelDefinition[]>;
  },
): Promise<ModelDefinition[]> {
  return resolveModelsAsync(providerId, builtInModels, options);
}

async function resolveModelsAsync(
  providerId: string,
  builtInModels: string | ModelDefinition[],
  options?: { forceFetch?: boolean; fetchFn?: (providerId: string, url: string) => Promise<ModelDefinition[]> },
): Promise<ModelDefinition[]> {
  const cache = loadModelsCache();
  const providerCache = cache.providers[providerId];

  // 1. User overrides always win
  if (providerCache?.userOverrides && providerCache.userOverrides.length > 0) {
    return providerCache.userOverrides;
  }

  // 2. Cached fetch (if still fresh)
  if (providerCache?.fetched && providerCache.fetchedAt) {
    const age = Date.now() - new Date(providerCache.fetchedAt).getTime();
    if (age < CACHE_TTL_MS && providerCache.fetched.length > 0) {
      return providerCache.fetched;
    }
  }

  // 3. Built-in static list
  if (Array.isArray(builtInModels) && builtInModels.length > 0) {
    return builtInModels;
  }

  // 4. If it's a URL and we have a fetch function, try fetching
  if (typeof builtInModels === "string" && builtInModels.startsWith("http") && options?.fetchFn) {
    try {
      const fetched = await options.fetchFn(providerId, builtInModels);
      if (fetched.length > 0) {
        // Cache the result
        updateProviderCache(providerId, { fetched, fetchedAt: new Date().toISOString() });
        return fetched;
      }
    } catch {
      // Fall through
    }
  }

  return [];
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Update the cached models for a provider (fetched or user overrides) */
export function updateProviderCache(
  providerId: string,
  updates: Partial<Pick<ProviderModelCache, "fetched" | "fetchedAt" | "userOverrides">>,
): void {
  const cache = loadModelsCache();
  cache.providers[providerId] = {
    ...cache.providers[providerId],
    ...updates,
  };
  saveModelsCache(cache);
}

/** Set user-defined models for a provider (overrides everything) */
export function setUserModels(providerId: string, models: ModelDefinition[]): void {
  updateProviderCache(providerId, { userOverrides: models });
}

/** Add a single model to a provider's user overrides */
export function addUserModel(providerId: string, model: ModelDefinition): void {
  const cache = loadModelsCache();
  const existing = cache.providers[providerId]?.userOverrides ?? [];
  // Replace if same ID exists, otherwise append
  const updated = existing.filter((m) => m.id !== model.id).concat(model);
  updateProviderCache(providerId, { userOverrides: updated });
}

/** Remove a model from a provider's user overrides */
export function removeUserModel(providerId: string, modelId: string): boolean {
  const cache = loadModelsCache();
  const existing = cache.providers[providerId]?.userOverrides ?? [];
  if (!existing.some((m) => m.id === modelId)) return false;
  updateProviderCache(providerId, { userOverrides: existing.filter((m) => m.id !== modelId) });
  return true;
}

/** Clear all cached data for a provider, reverting to built-in static list */
export function clearUserModels(providerId: string): void {
  const cache = loadModelsCache();
  delete cache.providers[providerId];
  saveModelsCache(cache);
}

/** Check if a provider has user overrides */
export function hasUserOverrides(providerId: string): boolean {
  const cache = loadModelsCache();
  return (cache.providers[providerId]?.userOverrides?.length ?? 0) > 0;
}

/** Get the age of cached fetch for a provider */
export function getCacheAge(providerId: string): number | null {
  const cache = loadModelsCache();
  const fetchedAt = cache.providers[providerId]?.fetchedAt;
  if (!fetchedAt) return null;
  return Date.now() - new Date(fetchedAt).getTime();
}

/** Check if cached fetch is still fresh (within TTL) */
export function isCacheFresh(providerId: string): boolean {
  const age = getCacheAge(providerId);
  return age !== null && age < CACHE_TTL_MS;
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Clear in-memory cache (for testing only) */
export function _resetCache(): void {
  _cache = undefined;
  _cacheMtime = 0;
}
