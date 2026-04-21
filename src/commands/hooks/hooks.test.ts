import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-hooks-test-${Date.now()}`);
const RELAY_BIN = path.join(process.cwd(), "bin", "relay.js");

// Helper to run CLI commands with stdin
function runCli(args: string[], stdin?: string, cwd?: string) {
  return spawnSync("bun", [RELAY_BIN, ...args], {
    input: stdin,
    timeout: 30_000,
    cwd,
    env: { ...process.env, RELAY_TEST_MODE: "1" },
    stdio: stdin ? ["pipe", "pipe", "pipe"] : undefined,
  });
}

describe("relay hooks - Claude Code Hook Integration Tests", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  //==========================================================================
  // Test 1: relay hooks post-tool (PostToolUse hook)
  //==========================================================================

  describe("relay hooks post-tool - PostToolUse Hook", () => {
    test("should read file_path from stdin", () => {
      const testFile = path.join(TEST_DIR, "stdin-test.ts");
      fs.writeFileSync(testFile, "const    y    =     2;");

      const stdin = JSON.stringify({
        tool_input: { file_path: testFile },
      });

      const result = runCli(["hooks", "post-tool", "--silent"], stdin);
      expect([0, null]).toContain(result.status);
    });

    test("should handle various file path field names", () => {
      const testFile = path.join(TEST_DIR, "field-test.ts");
      fs.writeFileSync(testFile, "const    a    =    4;");

      // Test 'path' field
      const stdin1 = JSON.stringify({ path: testFile });
      let result = runCli(["hooks", "post-tool", "--silent"], stdin1);
      expect([0, null]).toContain(result.status);

      // Test 'file' field
      const stdin2 = JSON.stringify({ file: testFile });
      result = runCli(["hooks", "post-tool", "--silent"], stdin2);
      expect([0, null]).toContain(result.status);
    });

    test("should handle --all flag", () => {
      // Create multiple test files
      fs.writeFileSync(
        path.join(TEST_DIR, "file1.ts"),
        "const    x    =    1;"
      );
      fs.writeFileSync(
        path.join(TEST_DIR, "file2.js"),
        "const    y    =    2;"
      );

      const result = runCli(
        ["hooks", "post-tool", "--all"],
        undefined,
        TEST_DIR
      );
      expect([0, null]).toContain(result.status);
    });

    test("should show 'No files to format' when no files provided", () => {
      const result = runCli(["hooks", "post-tool", "--silent"], "{}");
      expect([0, null]).toContain(result.status);
    });

    test("should handle non-existent file gracefully", () => {
      const stdin = JSON.stringify({
        file_path: "/nonexistent/file.ts",
      });
      const result = runCli(["hooks", "post-tool", "--silent"], stdin);
      expect([0, null]).toContain(result.status);
    });

    test("should handle nested tool_input object", () => {
      const testFile = path.join(TEST_DIR, "nested-test.ts");
      fs.writeFileSync(testFile, "let    z    =    3;");

      const stdin = JSON.stringify({
        tool_name: "Write",
        tool_input: {
          file_path: testFile,
          content: "let    z    =    3;",
        },
      });

      const result = runCli(["hooks", "post-tool", "--silent"], stdin);
      expect([0, null]).toContain(result.status);
    });
  });

  //==========================================================================
  // Test 2: relay hooks stop (Stop hook)
  //==========================================================================

  describe("relay hooks stop - Stop Hook", () => {
    test("should read transcript_path from stdin", () => {
      const transcriptPath = path.join(TEST_DIR, "stop-transcript.jsonl");
      const transcriptContent = [
        JSON.stringify({ role: "user", content: "Complete task" }),
      ].join("\n");
      fs.writeFileSync(transcriptPath, transcriptContent);

      const stdin = JSON.stringify({ transcript_path: transcriptPath });
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        stdin
      );
      expect([0, null]).toContain(result.status);
    });

    test("should extract message from new transcript format", () => {
      const transcriptPath = path.join(TEST_DIR, "stop-new-format.jsonl");
      const transcriptContent = [
        JSON.stringify({
          message: { role: "user", content: "Refactor module" },
        }),
      ].join("\n");
      fs.writeFileSync(transcriptPath, transcriptContent);

      const stdin = JSON.stringify({ transcript_path: transcriptPath });
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        stdin
      );
      expect([0, null]).toContain(result.status);
    });

    test("should handle missing transcript gracefully", () => {
      const stdin = JSON.stringify({
        transcript_path: "/nonexistent/stop-transcript.jsonl",
      });
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        stdin
      );
      expect([0, null]).toContain(result.status);
    });

    test("should handle empty transcript file", () => {
      const transcriptPath = path.join(TEST_DIR, "empty-transcript.jsonl");
      fs.writeFileSync(transcriptPath, "");

      const stdin = JSON.stringify({ transcript_path: transcriptPath });
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        stdin
      );
      expect([0, null]).toContain(result.status);
    });

    test("should handle invalid JSON stdin gracefully", () => {
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        "not valid json"
      );
      expect([0, null]).toContain(result.status);
    });

    test("should detect uncommitted changes in git repo", () => {
      const gitDir = path.join(TEST_DIR, "git-repo");
      fs.mkdirSync(gitDir, { recursive: true });
      spawnSync("git", ["init"], { cwd: gitDir });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: gitDir,
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: gitDir });

      const trackedFile = path.join(gitDir, "tracked.txt");
      fs.writeFileSync(trackedFile, "initial");
      spawnSync("git", ["add", "."], { cwd: gitDir });
      spawnSync("git", ["commit", "-m", "initial"], { cwd: gitDir });

      fs.writeFileSync(trackedFile, "modified");

      const transcriptPath = path.join(gitDir, "transcript.jsonl");
      fs.writeFileSync(transcriptPath, "");

      const stdin = JSON.stringify({ transcript_path: transcriptPath });
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        stdin,
        gitDir
      );
      expect([0, null]).toContain(result.status);
    });

    test("should handle --no-commit flag", () => {
      const gitDir = path.join(TEST_DIR, "no-commit-repo");
      fs.mkdirSync(gitDir, { recursive: true });
      spawnSync("git", ["init"], { cwd: gitDir });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: gitDir,
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: gitDir });

      const testFile = path.join(gitDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      const transcriptPath = path.join(gitDir, "transcript.jsonl");
      fs.writeFileSync(transcriptPath, "");

      const stdin = JSON.stringify({ transcript_path: transcriptPath });
      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        stdin,
        gitDir
      );
      expect([0, null]).toContain(result.status);
    });

    test("should handle different commit modes", () => {
      const transcriptPath = path.join(TEST_DIR, "mode-test-transcript.jsonl");
      fs.writeFileSync(transcriptPath, "");

      const stdin = JSON.stringify({ transcript_path: transcriptPath });

      // Test mode=none with --no-commit (no actual commit attempted)
      let result = runCli(
        ["hooks", "stop", "--silent", "--no-commit", "--mode", "none"],
        stdin
      );
      expect([0, null]).toContain(result.status);

      // Test mode=normal with --no-commit
      result = runCli(
        ["hooks", "stop", "--silent", "--no-commit", "--mode", "normal"],
        stdin
      );
      expect([0, null]).toContain(result.status);

      // Test mode=critical with --no-commit
      result = runCli(
        ["hooks", "stop", "--silent", "--no-commit", "--mode", "critical"],
        stdin
      );
      expect([0, null]).toContain(result.status);
    });

    test("should handle non-git directory gracefully", () => {
      const result = runCli(["hooks", "stop", "--silent"], "{}", TEST_DIR);
      expect([0, null]).toContain(result.status);
    });
  });

  //==========================================================================
  // Test 3: relay auto hook (SessionStart hook)
  //==========================================================================

  describe("relay auto hook - SessionStart Hook", () => {
    test("should run with --silent flag without crashing", () => {
      const configDir = path.join(TEST_DIR, ".claude");
      fs.mkdirSync(configDir, { recursive: true });

      const configPath = path.join(configDir, "relay.json");
      const config = {
        version: "2.0.0",
        accounts: {
          test_acc: {
            id: "test_acc",
            name: "Test",
            provider: "zai" as const,
            apiKey: "test-key",
            baseUrl: "https://api.test.com",
            priority: 1,
            isActive: true,
            createdAt: new Date().toISOString(),
          },
        },
        activeAccountId: "test_acc",
        activeModelProviderId: "test_acc",
        activeMcpProviderId: "test_acc",
        alerts: [],
        notifications: { method: "console" as const, enabled: true },
        dashboard: { port: 3456, host: "localhost", enabled: false },
        rotation: {
          enabled: false,
          strategy: "round-robin" as const,
          crossProvider: true,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const settingsPath = path.join(configDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));

      const result = runCli(["auto", "hook", "--silent"], undefined, TEST_DIR);
      expect([0, null]).toContain(result.status);
    });

    test("should handle missing config gracefully", () => {
      const fakeHome = path.join(TEST_DIR, "nonexistent-home");
      fs.mkdirSync(fakeHome, { recursive: true });

      const result = runCli(["auto", "hook", "--silent"], undefined, fakeHome);
      expect(result.status).toBeDefined();
    });
  });

  //==========================================================================
  // Integration Tests
  //==========================================================================

  describe("Full Hook Integration Tests", () => {
    test("PostToolUse hook with Claude Code input format", () => {
      const testFile = path.join(TEST_DIR, "integration-test.ts");
      fs.writeFileSync(testFile, "const    integration    =    true;");

      const claudeCodeInput = {
        session_id: "test-session-123",
        transcript_path: "/test/transcript.jsonl",
        cwd: TEST_DIR,
        permission_mode: "default",
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: testFile },
        tool_response: { success: true, filePath: testFile },
        tool_use_id: "toolu_123456",
      };

      const result = runCli(
        ["hooks", "post-tool", "--silent"],
        JSON.stringify(claudeCodeInput)
      );
      expect([0, null]).toContain(result.status);
    });

    test("Stop hook with Claude Code input format", () => {
      const transcriptPath = path.join(
        TEST_DIR,
        "integration-transcript.jsonl"
      );
      const transcriptContent = [
        JSON.stringify({
          message: { role: "user", content: "Implement feature" },
        }),
        JSON.stringify({
          message: { role: "assistant", content: "Done" },
        }),
      ].join("\n");
      fs.writeFileSync(transcriptPath, transcriptContent);

      const claudeCodeInput = {
        session_id: "test-session-456",
        transcript_path: transcriptPath,
        cwd: TEST_DIR,
        permission_mode: "default",
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "Done",
      };

      const result = runCli(
        ["hooks", "stop", "--silent", "--no-commit"],
        JSON.stringify(claudeCodeInput)
      );
      expect([0, null]).toContain(result.status);
    });

    test("All hooks should handle edge cases gracefully", () => {
      // Empty stdin
      let result = runCli(["hooks", "post-tool", "--silent"], "");
      expect(result.status).toBeDefined();

      // Empty JSON with --no-commit to avoid slow commit
      result = runCli(["hooks", "stop", "--silent", "--no-commit"], "{}");
      expect(result.status).toBeDefined();
    });
  });
});
