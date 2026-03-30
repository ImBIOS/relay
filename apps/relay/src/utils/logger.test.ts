import { describe, expect, it, vi } from "bun:test";
import {
  debug,
  divider,
  error,
  info,
  log,
  section,
  success,
  table,
  warning,
} from "./logger";

describe("logger", () => {
  describe("log", () => {
    it("should log message with default info level", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      log("test message");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should log message with specified level", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      log("test message", "error");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should include timestamp in log output", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      log("test message");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
      consoleSpy.mockRestore();
    });
  });

  describe("log levels", () => {
    it("should call success with success level", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      success("success message");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("✓");
      consoleSpy.mockRestore();
    });

    it("should call info with info level", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      info("info message");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("ℹ");
      consoleSpy.mockRestore();
    });

    it("should call warning with warning level", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      warning("warning message");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("⚠");
      consoleSpy.mockRestore();
    });

    it("should call error with error level", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      error("error message");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("✗");
      consoleSpy.mockRestore();
    });

    it("should call debug with debug level", () => {
      const orig = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "debug";
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      debug("debug message");
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("↪");
      consoleSpy.mockRestore();
      if (orig !== undefined) {
        process.env.LOG_LEVEL = orig;
      } else {
        process.env.LOG_LEVEL = undefined;
      }
    });
  });

  describe("table", () => {
    it("should format data as table", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      table({ key1: "value1", key2: "value2" });
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("→");
      consoleSpy.mockRestore();
    });
  });

  describe("section", () => {
    it("should print section header", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      section("Test Section");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("divider", () => {
    it("should print empty line", () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      divider();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
