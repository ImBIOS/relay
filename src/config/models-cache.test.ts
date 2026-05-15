import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  loadModelsCache,
  saveModelsCache,
  setUserModels,
  addUserModel,
  removeUserModel,
  clearUserModels,
  hasUserOverrides,
  isCacheFresh,
  getCacheAge,
  updateProviderCache,
  _resetCache,
  type CachedModels,
} from "./models-cache";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// Use a temp path for testing to avoid polluting real config
const TEST_DIR = `/tmp/relay-test-models-${Date.now()}`;
const originalHome = process.env.HOME;

beforeEach(() => {
  _resetCache();
  process.env.HOME = TEST_DIR;
  const dir = join(TEST_DIR, ".config", "relay");
  mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  process.env.HOME = originalHome;
  _resetCache();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("models-cache", () => {
  test("loadModelsCache returns empty cache when no file exists", () => {
    const cache = loadModelsCache();
    expect(cache.providers).toEqual({});
  });

  test("saveModelsCache persists and loads back", () => {
    const cache: CachedModels = {
      lastRefreshed: "2026-01-01T00:00:00.000Z",
      providers: {
        zai: {
          fetched: [{ id: "glm-5.1", name: "GLM-5.1" }],
          fetchedAt: new Date().toISOString(),
        },
      },
    };
    saveModelsCache(cache);
    _resetCache(); // Force reload from disk
    const loaded = loadModelsCache();
    expect(loaded.providers.zai?.fetched?.length).toBe(1);
    expect(loaded.providers.zai?.fetched?.[0]?.id).toBe("glm-5.1");
  });

  test("setUserModels replaces all models for a provider", () => {
    setUserModels("zai", [
      { id: "glm-custom", name: "GLM Custom", contextLength: 500000, toolsSupported: true },
    ]);
    _resetCache();
    const cache = loadModelsCache();
    expect(cache.providers.zai?.userOverrides?.length).toBe(1);
    expect(cache.providers.zai?.userOverrides?.[0]?.id).toBe("glm-custom");
  });

  test("addUserModel appends a new model", () => {
    addUserModel("zai", { id: "glm-a", name: "GLM A" });
    addUserModel("zai", { id: "glm-b", name: "GLM B" });
    _resetCache();
    const cache = loadModelsCache();
    expect(cache.providers.zai?.userOverrides?.length).toBe(2);
  });

  test("addUserModel replaces existing model with same id", () => {
    addUserModel("zai", { id: "glm-5", name: "GLM-5 Old", contextLength: 200000 });
    addUserModel("zai", { id: "glm-5", name: "GLM-5 Updated", contextLength: 300000 });
    _resetCache();
    const cache = loadModelsCache();
    expect(cache.providers.zai?.userOverrides?.length).toBe(1);
    expect(cache.providers.zai?.userOverrides?.[0]?.name).toBe("GLM-5 Updated");
    expect(cache.providers.zai?.userOverrides?.[0]?.contextLength).toBe(300000);
  });

  test("removeUserModel removes a model by id", () => {
    addUserModel("zai", { id: "glm-a", name: "GLM A" });
    addUserModel("zai", { id: "glm-b", name: "GLM B" });
    const removed = removeUserModel("zai", "glm-a");
    expect(removed).toBe(true);
    _resetCache();
    const cache = loadModelsCache();
    expect(cache.providers.zai?.userOverrides?.length).toBe(1);
    expect(cache.providers.zai?.userOverrides?.[0]?.id).toBe("glm-b");
  });

  test("removeUserModel returns false for non-existent model", () => {
    addUserModel("zai", { id: "glm-a", name: "GLM A" });
    const removed = removeUserModel("zai", "nonexistent");
    expect(removed).toBe(false);
  });

  test("clearUserModels removes user overrides", () => {
    addUserModel("zai", { id: "glm-custom", name: "GLM Custom" });
    expect(hasUserOverrides("zai")).toBe(true);
    clearUserModels("zai");
    _resetCache();
    expect(hasUserOverrides("zai")).toBe(false);
  });

  test("hasUserOverrides returns false when no overrides", () => {
    expect(hasUserOverrides("zai")).toBe(false);
  });

  test("isCacheFresh returns false when no cache", () => {
    expect(isCacheFresh("zai")).toBe(false);
  });

  test("isCacheFresh returns true for recent cache", () => {
    saveModelsCache({
      providers: {
        zai: { fetched: [{ id: "glm-5", name: "GLM-5" }], fetchedAt: new Date().toISOString() },
      },
    });
    _resetCache();
    expect(isCacheFresh("zai")).toBe(true);
  });

  test("isCacheFresh returns false for stale cache (8 days old)", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    saveModelsCache({
      providers: {
        zai: { fetched: [{ id: "glm-5", name: "GLM-5" }], fetchedAt: eightDaysAgo },
      },
    });
    _resetCache();
    expect(isCacheFresh("zai")).toBe(false);
  });

  test("getCacheAge returns null when no cache", () => {
    expect(getCacheAge("zai")).toBeNull();
  });

  test("getCacheAge returns age in ms for cached provider", () => {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    saveModelsCache({
      providers: {
        zai: { fetched: [{ id: "glm-5", name: "GLM-5" }], fetchedAt: oneHourAgo },
      },
    });
    _resetCache();
    const age = getCacheAge("zai");
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThan(3500000);
    expect(age!).toBeLessThan(3700000);
  });

  test("updateProviderCache preserves existing fields", () => {
    addUserModel("zai", { id: "glm-custom", name: "GLM Custom" });
    // Now add a fetched cache — user overrides should be preserved
    updateProviderCache("zai", { fetched: [{ id: "glm-5", name: "GLM-5" }], fetchedAt: new Date().toISOString() });
    _resetCache();
    const cache = loadModelsCache();
    expect(cache.providers.zai?.userOverrides?.length).toBe(1);
    expect(cache.providers.zai?.fetched?.length).toBe(1);
  });
});
