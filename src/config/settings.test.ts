import { describe, expect, it } from "bun:test";
import {
  getActiveProvider,
} from "./settings";

describe("settings", () => {
  describe("getActiveProvider", () => {
    it("should return a valid provider", () => {
      const provider = getActiveProvider();
      // Returns 'zai' as default when no provider in config
      expect(["zai", "minimax"]).toContain(provider);
    });
  });
});
