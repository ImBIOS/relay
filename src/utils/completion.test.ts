import { describe, expect, it } from "bun:test";
import {
  getAllCompletions,
  getShellCompletion,
  installCompletion,
  SHELLS,
} from "./completion";

describe("completion", () => {
  describe("SHELLS", () => {
    it("should contain bash, zsh, and fish shells", () => {
      const shellNames = SHELLS.map((s) => s.name);
      expect(shellNames).toContain("bash");
      expect(shellNames).toContain("zsh");
      expect(shellNames).toContain("fish");
    });

    it("each shell should have name and completions", () => {
      for (const shell of SHELLS) {
        expect(shell.name).toBeTruthy();
        expect(shell.completions).toBeTruthy();
        expect(typeof shell.completions).toBe("string");
      }
    });
  });

  describe("getShellCompletion", () => {
    it("should return bash completion", () => {
      const completion = getShellCompletion("bash");
      expect(completion).toContain("complete -F");
      expect(completion).toContain("relay");
    });

    it("should return zsh completion", () => {
      const completion = getShellCompletion("zsh");
      expect(completion).toContain("#compdef relay");
      expect(completion).toContain("config:Configure");
    });

    it("should return fish completion", () => {
      const completion = getShellCompletion("fish");
      expect(completion).toContain("complete -c relay");
    });

    it("should throw for unsupported shell", () => {
      expect(() => getShellCompletion("powershell")).toThrow(
        "Unsupported shell: powershell"
      );
    });
  });

  describe("getAllCompletions", () => {
    it("should return all shell completions", () => {
      const completions = getAllCompletions();
      expect(Object.keys(completions)).toEqual(["bash", "zsh", "fish"]);
      expect(completions.bash).toBeTruthy();
      expect(completions.zsh).toBeTruthy();
      expect(completions.fish).toBeTruthy();
    });
  });

  describe("installCompletion", () => {
    it("should return success for dry run", () => {
      const result = installCompletion("bash", true);
      expect(result.success).toBe(true);
      expect(result.message).toContain("Would write completion");
    });

    it("should return success message for non-dry run", () => {
      const result = installCompletion("bash", false);
      expect(result.success).toBe(true);
      expect(result.message).toContain("installed");
    });
  });
});
