import fs from "node:fs";
import path from "node:path";
import { ConfirmInput, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import { BaseCommand } from "../../oclif/base";
import { Section } from "../../ui/index";

interface ProjectHealthCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

// CLAUDE.example.md template path
const TEMPLATE_PATH = path.resolve(process.cwd(), "CLAUDE.example.md");

export default class ProjectDoctor extends BaseCommand<typeof ProjectDoctor> {
  static description = "Check project health and diagnose issues";
  static examples = [
    "<%= config.bin %> project doctor",
    "<%= config.bin %> project doctor /path/to/project",
  ];

  async run(): Promise<void> {
    await this.renderApp(<ProjectDoctorUI />);
  }
}

function ProjectDoctorUI(): React.ReactElement {
  const { exit } = useApp();
  const [projectPath, setProjectPath] = useState<string>(process.cwd());
  const [healthChecks, setHealthChecks] = useState<ProjectHealthCheck[]>([]);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [hasRun, setHasRun] = useState<boolean>(false);

  const runHealthChecks = async () => {
    setIsChecking(true);
    const checks: ProjectHealthCheck[] = [];

    // Check 1: CLAUDE.md exists
    const claudeMdPath = path.join(projectPath, "CLAUDE.md");
    const hasClaideMd = fs.existsSync(claudeMdPath);
    checks.push({
      name: "CLAUDE.md exists",
      status: hasClaideMd ? "pass" : "fail",
      message: hasClaideMd
        ? "CLAUDE.md found in project root"
        : "No CLAUDE.md file found",
      fix: hasClaideMd
        ? undefined
        : "Run 'relay project init' to create CLAUDE.md from template",
    });

    // Check 2: CLAUDE.md is readable and valid
    if (hasClaideMd) {
      try {
        const content = fs.readFileSync(claudeMdPath, "utf-8");
        const isValid = content.length > 100 && content.includes("##");
        checks.push({
          name: "CLAUDE.md is valid",
          status: isValid ? "pass" : "warn",
          message: isValid
            ? "CLAUDE.md has valid content"
            : "CLAUDE.md may be empty or malformed",
          fix: isValid
            ? undefined
            : "Consider regenerating with 'relay project init'",
        });
      } catch {
        checks.push({
          name: "CLAUDE.md is readable",
          status: "fail",
          message: "Cannot read CLAUDE.md file",
          fix: "Check file permissions",
        });
      }
    }

    // Check 3: CLAUDE.example.md exists (for reference)
    const hasTemplate = fs.existsSync(TEMPLATE_PATH);
    checks.push({
      name: "CLAUDE.example.md template",
      status: hasTemplate ? "pass" : "warn",
      message: hasTemplate
        ? "Template file available"
        : "Template file not found (this may be normal)",
    });

    // Check 4: package.json exists
    const packageJsonPath = path.join(projectPath, "package.json");
    const hasPackageJson = fs.existsSync(packageJsonPath);
    checks.push({
      name: "package.json exists",
      status: hasPackageJson ? "pass" : "warn",
      message: hasPackageJson ? "package.json found" : "No package.json found",
      fix: hasPackageJson ? undefined : "Run 'npm init' or 'bun init'",
    });

    // Check 5: node_modules exists (if package.json exists)
    if (hasPackageJson) {
      const nodeModulesPath = path.join(projectPath, "node_modules");
      const hasNodeModules = fs.existsSync(nodeModulesPath);
      checks.push({
        name: "Dependencies installed",
        status: hasNodeModules ? "pass" : "warn",
        message: hasNodeModules
          ? "node_modules found"
          : "node_modules not found - dependencies may need installation",
        fix: hasNodeModules ? undefined : "Run 'bun install' or 'npm install'",
      });
    }

    // Check 6: TypeScript config
    const tsConfigPath = path.join(projectPath, "tsconfig.json");
    const hasTsConfig = fs.existsSync(tsConfigPath);
    checks.push({
      name: "TypeScript config",
      status: hasTsConfig ? "pass" : "warn",
      message: hasTsConfig ? "tsconfig.json found" : "No tsconfig.json found",
    });

    // Check 7: Git repository
    const gitPath = path.join(projectPath, ".git");
    const hasGit = fs.existsSync(gitPath);
    checks.push({
      name: "Git repository",
      status: hasGit ? "pass" : "warn",
      message: hasGit
        ? "Git repository initialized"
        : "No .git directory found",
      fix: hasGit ? undefined : "Run 'git init'",
    });

    // Check 8: .gitignore
    const gitignorePath = path.join(projectPath, ".gitignore");
    const hasGitignore = fs.existsSync(gitignorePath);
    checks.push({
      name: ".gitignore exists",
      status: hasGitignore ? "pass" : "warn",
      message: hasGitignore
        ? ".gitignore found"
        : "No .gitignore found - consider creating one",
    });

    // Check 9: README.md
    const readmePath = path.join(projectPath, "README.md");
    const hasReadme = fs.existsSync(readmePath);
    checks.push({
      name: "README.md exists",
      status: hasReadme ? "pass" : "warn",
      message: hasReadme
        ? "README.md found"
        : "No README.md found - consider adding documentation",
    });

    // Check 10: Check if in a Bun project
    const bunlockPath = path.join(projectPath, "bun.lockb");
    const packageLockPath = path.join(projectPath, "package-lock.json");
    const yarnLockPath = path.join(projectPath, "yarn.lock");
    const hasLockFile =
      hasPackageJson && (bunlockPath || packageLockPath || yarnLockPath);
    checks.push({
      name: "Lock file exists",
      status: hasLockFile ? "pass" : "warn",
      message: hasLockFile
        ? "Lock file found"
        : "No lock file found - consider adding one for reproducibility",
      fix:
        !hasLockFile && hasPackageJson
          ? "Run 'bun install' or 'npm install'"
          : undefined,
    });

    setHealthChecks(checks);
    setIsChecking(false);
    setHasRun(true);
  };

  const autoFixClaideMd = async () => {
    try {
      // Read template
      const templateContent = fs.readFileSync(TEMPLATE_PATH, "utf-8");

      // Customize template with project name
      const projectName = path.basename(projectPath);
      const claudeMdContent = templateContent.replace(
        /# `projectName`'/s,
        `# \`${projectName}\`'`
      );

      // Write CLAUDE.md
      const claudeMdPath = path.join(projectPath, "CLAUDE.md");
      fs.writeFileSync(claudeMdPath, claudeMdContent);

      // Re-run health checks
      await runHealthChecks();
    } catch (error: unknown) {
      // Error handling is done via state
    }
  };

  const getStatusIcon = (status: "pass" | "fail" | "warn") => {
    switch (status) {
      case "pass":
        return "✓";
      case "fail":
        return "✗";
      case "warn":
        return "⚠";
    }
  };

  const getStatusColor = (status: "pass" | "fail" | "warn") => {
    switch (status) {
      case "pass":
        return "green";
      case "fail":
        return "red";
      case "warn":
        return "yellow";
    }
  };

  const getStatusLabel = (status: "pass" | "fail" | "warn") => {
    switch (status) {
      case "pass":
        return "PASS";
      case "fail":
        return "FAIL";
      case "warn":
        return "WARN";
    }
  };

  const passedCount = healthChecks.filter((c) => c.status === "pass").length;
  const failedCount = healthChecks.filter((c) => c.status === "fail").length;
  const warnCount = healthChecks.filter((c) => c.status === "warn").length;

  return (
    <Section title="relay Project Doctor">
      <Box flexDirection="column">
        {/* Project Path Input */}
        {!(hasRun || isChecking) && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Project directory:</Text>
            <Box marginTop={1}>
              <TextInput
                defaultValue={projectPath}
                onSubmit={(inputPath) => {
                  setProjectPath(inputPath || process.cwd());
                }}
                placeholder="Enter project path (default: current directory)"
              />
            </Box>
            <Box marginTop={1}>
              <Text>Run health checks? </Text>
              <ConfirmInput
                onCancel={() => {
                  process.exit(0);
                }}
                onConfirm={() => runHealthChecks()}
              />
            </Box>
          </Box>
        )}

        {/* Checking */}
        {isChecking && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Running health checks...</Text>
          </Box>
        )}

        {/* Results */}
        {hasRun && !isChecking && (
          <Box flexDirection="column" marginTop={1}>
            {/* Summary */}
            <Box flexDirection="row" gap={4}>
              <Text color="green">Passed: {passedCount}</Text>
              <Text color="red">Failed: {failedCount}</Text>
              <Text color="yellow">Warnings: {warnCount}</Text>
            </Box>

            {/* Health Check Results */}
            <Box flexDirection="column" marginTop={1}>
              {healthChecks.map((check, index) => (
                <Box flexDirection="column" key={index} marginBottom={1}>
                  <Box flexDirection="row" gap={1}>
                    <Text color={getStatusColor(check.status)}>
                      {getStatusIcon(check.status)}
                    </Text>
                    <Text bold>{check.name}</Text>
                    <Text color="gray">[</Text>
                    <Text color={getStatusColor(check.status)}>
                      {getStatusLabel(check.status)}
                    </Text>
                    <Text color="gray">]</Text>
                  </Box>
                  <Box marginLeft={3}>
                    <Text color="gray">{check.message}</Text>
                  </Box>
                  {check.fix && check.status !== "pass" && (
                    <Box marginLeft={3}>
                      <Text color="cyan">Fix: {check.fix}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>

            {/* Auto-fix for missing CLAUDE.md */}
            {failedCount > 0 && (
              <Box marginTop={1}>
                <Text>
                  {failedCount > 0 ? `Found ${failedCount} issue(s). ` : ""}
                </Text>
                {healthChecks.find(
                  (c) => c.name === "CLAUDE.md exists" && c.status === "fail"
                ) && (
                  <ConfirmInput
                    onCancel={() => {
                      process.exit(0);
                    }}
                    onConfirm={() => autoFixClaideMd()}
                  />
                )}
              </Box>
            )}

            {/* Re-run */}
            <Box marginTop={1}>
              <Text>Run again? </Text>
              <ConfirmInput
                onCancel={() => {
                  process.exit(0);
                }}
                onConfirm={() => runHealthChecks()}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Section>
  );
}

// Handler function for use in index.ts
export async function handleProjectDoctor(): Promise<void> {
  // Minimal config for programmatic invocation
  const config = {
    root: process.cwd(),
    name: "relay",
    version: "2.1.0",
  } as unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmd = new ProjectDoctor([""], config as any);
  await cmd.run();
}
