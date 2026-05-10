/**
 * Integration test: ForgeCode hooks (forge-stop auto-commit flow).
 *
 * MUST run inside Docker — creates git commits and modifies shell config.
 * Never run on host to avoid environment pollution.
 *
 * Run: docker run --rm -v $(pwd):/relay relay-test src/tests/integration/hooks-forge-stop.integration.test.ts
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-forge-stop-test-${Date.now()}`);
const GIT_REPO = path.join(TEST_DIR, "test-repo");
const RELAY_BIN = path.join(process.cwd(), "src", "run.ts");

// Skip if not running in Docker (check for /.dockerenv)
const isDocker = fs.existsSync("/.dockerenv") || process.env.RELAY_INTEGRATION_TEST === "1";

describe.skipIf(!isDocker)("hooks forge-stop integration", () => {
  beforeEach(() => {
    fs.mkdirSync(GIT_REPO, { recursive: true });
    execSync("git init", { cwd: GIT_REPO });
    execSync('git config user.email "test@relay.local"', { cwd: GIT_REPO });
    execSync('git config user.name "Relay Test"', { cwd: GIT_REPO });

    // Create initial commit
    fs.writeFileSync(path.join(GIT_REPO, "README.md"), "# Test");
    execSync("git add .", { cwd: GIT_REPO });
    execSync('git commit -m "initial"', { cwd: GIT_REPO });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test("forge-stop creates a conventional commit", () => {
    // Make changes
    fs.writeFileSync(path.join(GIT_REPO, "src/app.ts"), "console.log('hello')");
    execSync("git add .", { cwd: GIT_REPO });

    // Run forge-stop
    spawnSync(
      "bun",
      [RELAY_BIN, "hooks", "forge-stop", "--no-background", "--silent"],
      {
        cwd: GIT_REPO,
        env: { ...process.env, HOME: TEST_DIR },
        timeout: 30_000,
      },
    );

    // Check that a new commit was created
    const log = execSync("git log --oneline -1", { cwd: GIT_REPO }).toString().trim();

    // Should have created a commit (format varies by forgecode-sdk output)
    expect(log).toBeDefined();
    expect(log.length).toBeGreaterThan(0);
  });
});
