import { describe, expect, it } from "bun:test";
import { exportEnvVars, getEnvPath } from "./env";

describe("env", () => {
  describe("getEnvPath", () => {
    it("should return env file path in .claude directory", () => {
      const envPath = getEnvPath();
      expect(envPath).toContain(".claude");
      expect(envPath).toContain("relay.env");
    });
  });

  describe("exportEnvVars", () => {
    it("should generate env var exports with quotes", () => {
      const output = exportEnvVars(
        "test-api-key",
        "https://api.test.com",
        "test-model"
      );
      expect(output).toContain('ANTHROPIC_AUTH_TOKEN="test-api-key"');
      expect(output).toContain('ANTHROPIC_BASE_URL="https://api.test.com"');
      expect(output).toContain('ANTHROPIC_MODEL="test-model"');
    });

    it("should include timeout setting", () => {
      const output = exportEnvVars("key", "url", "model");
      expect(output).toContain("API_TIMEOUT_MS=3000000");
    });

    it("should include comment header", () => {
      const output = exportEnvVars("key", "url", "model");
      expect(output).toContain("# ImBIOS Environment Variables");
    });

    it("should include eval instruction", () => {
      const output = exportEnvVars("key", "url", "model");
      expect(output).toContain("eval");
    });
  });

  describe("loadEnvVars", () => {
    it("should parse quoted values correctly", () => {
      const input =
        'ANTHROPIC_AUTH_TOKEN="test-key"\nANTHROPIC_MODEL="model-name"';
      const lines = input.split("\n");
      const vars: Record<string, string> = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            vars[key.trim()] = valueParts.join("=").replace(/^["']|["']$/g, "");
          }
        }
      });

      expect(vars.ANTHROPIC_AUTH_TOKEN).toBe("test-key");
      expect(vars.ANTHROPIC_MODEL).toBe("model-name");
    });

    it("should handle unquoted values", () => {
      const input = "ANTHROPIC_BASE_URL=https://api.test.com";
      const lines = input.split("\n");
      const vars: Record<string, string> = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            vars[key.trim()] = valueParts.join("=").replace(/^["']|["']$/g, "");
          }
        }
      });

      expect(vars.ANTHROPIC_BASE_URL).toBe("https://api.test.com");
    });

    it("should ignore comments and empty lines", () => {
      const input = '# Comment\n\nANTHROPIC_AUTH_TOKEN="key"\n';
      const lines = input.split("\n");
      const vars: Record<string, string> = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            vars[key.trim()] = valueParts.join("=").replace(/^["']|["']$/g, "");
          }
        }
      });

      expect(Object.keys(vars)).toContain("ANTHROPIC_AUTH_TOKEN");
      expect(Object.keys(vars).length).toBe(1);
    });
  });
});
