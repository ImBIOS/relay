import fs from "node:fs";
import path from "node:path";
import { ConfirmInput, MultiSelect, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import { BaseCommand } from "../../oclif/base";
import { Error, Info, Section, Success, Warning } from "../../ui/index";

// CLAUDE.example.md template path
const TEMPLATE_PATH = path.resolve(process.cwd(), "CLAUDE.example.md");

interface ProjectConfig {
  name: string;
  description: string;
  technology: string[];
  useBun: boolean;
  useBiome: boolean;
  useReact: boolean;
}

const TECHNOLOGY_OPTIONS = [
  "React",
  "Vue",
  "Svelte",
  "Node.js",
  "Bun",
  "Deno",
  "Python",
  "Go",
  "Rust",
  "TypeScript",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
];

const TOOLS_OPTIONS = [
  { label: "Bun (runtime/package manager)", value: "Bun" },
  { label: "Biome (linter/formatter)", value: "Biome" },
  { label: "React (frontend framework)", value: "React" },
  { label: "Playwright (E2E testing)", value: "Playwright" },
];

export default class ProjectInit extends BaseCommand<typeof ProjectInit> {
  static description = "Initialize a new project with CLAUDE.md";
  static examples = ["<%= config.bin %> project init"];

  async run(): Promise<void> {
    await this.renderApp(<ProjectInitUI />);
  }
}

function ProjectInitUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<string>("welcome");
  const [config, setConfig] = useState<Partial<ProjectConfig>>({});
  const [messages, setMessages] = useState<
    Array<{ type: "info" | "success" | "warning" | "error"; text: string }>
  >([]);
  const [projectPath, setProjectPath] = useState<string>(process.cwd());

  const addMessage = (type: "info" | "success" | "warning" | "error", text: string) => {
    setMessages((prev) => [...prev, { type, text }]);
  };

  const checkClaideMd = (dir: string): boolean => {
    const claudeMdPath = path.join(dir, "CLAUDE.md");
    return fs.existsSync(claudeMdPath);
  };

  return (
    <Section title="relay Project Init">
      <Box flexDirection="column">
        {/* Messages */}
        {messages.map((msg, i) => (
          <Box key={`${msg.text}-${i}`}>
            {msg.type === "info" && <Info>{msg.text}</Info>}
            {msg.type === "success" && <Success>{msg.text}</Success>}
            {msg.type === "warning" && <Warning>{msg.text}</Warning>}
            {msg.type === "error" && <Error>{msg.text}</Error>}
          </Box>
        ))}

        {/* Welcome Step */}
        {step === "welcome" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Welcome to relay Project Init!</Text>
            <Box marginTop={1}>
              <Text color="gray">This will help you create a CLAUDE.md file for your project.</Text>
            </Box>
            <Box marginTop={1}>
              <Text>CLAUDE.md provides project-specific guidelines to Claude Code,</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>helping AI understand your project&apos;s conventions and best practices.</Text>
            </Box>
            <Box marginTop={1}>
              <Text>Continue? </Text>
              <ConfirmInput
                onCancel={() => {
                  addMessage("info", "Cancelled.");
                  setTimeout(() => exit(), 500);
                }}
                onConfirm={() => setStep("select-path")}
              />
            </Box>
          </Box>
        )}

        {/* Select Path */}
        {step === "select-path" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Project directory:</Text>
            <Box marginTop={1}>
              <TextInput
                defaultValue={projectPath}
                onSubmit={(inputPath) => {
                  const targetPath = inputPath || process.cwd();
                  setProjectPath(targetPath);

                  if (checkClaideMd(targetPath)) {
                    addMessage("warning", "CLAUDE.md already exists in this directory.");
                    setStep("existing-claude-md");
                  } else {
                    addMessage("info", "No CLAUDE.md found. Will create from template.");
                    setStep("configure-project");
                  }
                }}
                placeholder="Enter project path (default: current directory)"
              />
            </Box>
          </Box>
        )}

        {/* Existing CLAUDE.md found */}
        {step === "existing-claude-md" && (
          <Box flexDirection="column" marginTop={1}>
            <Warning>A CLAUDE.md file already exists in this directory.</Warning>
            <Box marginTop={1}>
              <Text>What would you like to do?</Text>
            </Box>
            <Box marginTop={1}>
              <MultiSelect
                onSubmit={(choice) => {
                  // choice is an array of values
                  const selected = choice[0];
                  if (selected === "skip") {
                    addMessage("info", "Keeping existing CLAUDE.md.");
                    setStep("done");
                    setTimeout(() => exit(), 500);
                  } else {
                    addMessage("info", "Proceeding to create new CLAUDE.md...");
                    setStep("configure-project");
                  }
                }}
                options={[
                  { label: "Keep existing CLAUDE.md", value: "skip" },
                  { label: "Overwrite with new template", value: "overwrite" },
                ]}
              />
            </Box>
          </Box>
        )}

        {/* Configure Project */}
        {step === "configure-project" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Let&apos;s configure your project.</Text>
            <Box marginTop={1}>
              <Text>Project name: </Text>
              <TextInput
                defaultValue={path.basename(projectPath)}
                onSubmit={(name) => {
                  setConfig({
                    ...config,
                    name: name || path.basename(projectPath),
                  });
                  setStep("describe-project");
                }}
                placeholder="Enter project name"
              />
            </Box>
          </Box>
        )}

        {/* Describe Project */}
        {step === "describe-project" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Brief description of your project:</Text>
            <Box marginTop={1}>
              <TextInput
                onSubmit={(description) => {
                  setConfig({ ...config, description });
                  setStep("select-technology");
                }}
                placeholder="e.g., A task management API with user authentication"
              />
            </Box>
          </Box>
        )}

        {/* Select Technology */}
        {step === "select-technology" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Select technologies used in your project:</Text>
            <Box paddingLeft={2}>
              <MultiSelect
                onSubmit={(techs) => {
                  setConfig({ ...config, technology: techs });
                  setStep("select-tools");
                }}
                options={TECHNOLOGY_OPTIONS.map((t) => ({
                  label: t,
                  value: t,
                }))}
              />
            </Box>
          </Box>
        )}

        {/* Select Tools */}
        {step === "select-tools" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Select development tools:</Text>
            <Box paddingLeft={2}>
              <MultiSelect
                onSubmit={(tools) => {
                  setConfig({
                    ...config,
                    useBun: tools.includes("Bun"),
                    useBiome: tools.includes("Biome"),
                    useReact: tools.includes("React"),
                  });
                  setStep("confirm-create");
                }}
                options={TOOLS_OPTIONS}
              />
            </Box>
          </Box>
        )}

        {/* Confirm Create */}
        {step === "confirm-create" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Ready to create CLAUDE.md with the following settings:</Text>
            <Box marginLeft={2} marginTop={1}>
              <Box flexDirection="column">
                <Text>Project: {config.name}</Text>
                <Text>Description: {config.description}</Text>
                <Text>Technologies: {config.technology?.join(", ") || "None selected"}</Text>
              </Box>
            </Box>
            <Box marginTop={1}>
              <Text>Create CLAUDE.md? </Text>
              <ConfirmInput
                defaultChoice="confirm"
                onCancel={() => {
                  addMessage("info", "Cancelled.");
                  setTimeout(() => exit(), 500);
                }}
                onConfirm={() => {
                  setStep("creating");
                  createClaideMd(config, projectPath, addMessage, exit, setStep);
                }}
              />
            </Box>
          </Box>
        )}

        {/* Creating */}
        {step === "creating" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Creating CLAUDE.md...</Text>
          </Box>
        )}

        {/* Done */}
        {step === "done" && (
          <Box flexDirection="column" marginTop={1}>
            <Success>Done!</Success>
            <Box marginTop={1}>
              <Text>
                Your project is now ready for Claude Code. Run <Text color="cyan">claude</Text> to
                start coding.
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </Section>
  );
}

async function createClaideMd(
  config: Partial<ProjectConfig>,
  projectPath: string,
  addMessage: (type: "info" | "success" | "warning" | "error", text: string) => void,
  exit: () => void,
  setStep: (step: string) => void,
) {
  try {
    // Read template
    const templateContent = fs.readFileSync(TEMPLATE_PATH, "utf-8");

    // Customize template
    let claudeMdContent = templateContent;

    // Replace project name
    const projectName = config.name || path.basename(projectPath);
    claudeMdContent = claudeMdContent.replace(/# `projectName`'/s, `# \`${projectName}\`'`);

    // Update project overview
    const overview =
      config.description ||
      `A ${config.technology?.[0] || "project"} built with modern best practices.`;
    claudeMdContent = claudeMdContent.replace(
      /This is a React TypeScript application for project management with a Bun backend\./s,
      overview,
    );

    // Update technology stack
    const techStack = config.technology || [];
    let frontend = "React 19";
    let backend = "Bun";
    let database = "PostgreSQL";

    if (config.useReact) {
      frontend = "React 19, TypeScript, Vite, TailwindCSS";
    }

    if (config.useBun) {
      backend = "Bun, TypeScript";
    }

    // Find database in tech stack
    const dbTech = techStack.find((t) => ["PostgreSQL", "MongoDB", "Redis", "SQLite"].includes(t));
    if (dbTech) {
      database = dbTech;
    }

    claudeMdContent = claudeMdContent.replace(
      /- Frontend: React 19, TypeScript 5\.9, Vite, TailwindCSS 4/s,
      `- Frontend: ${frontend}`,
    );

    claudeMdContent = claudeMdContent.replace(
      /- Backend: Bun, Elysia, TypeScript, oRPC, Drizzle ORM/s,
      `- Backend: ${backend}`,
    );

    claudeMdContent = claudeMdContent.replace(
      /- Database: PostgreSQL 18/s,
      `- Database: ${database}`,
    );

    // Update testing tools based on selections
    let testingTools = "Bun, happy-dom";
    if (config.useReact) {
      testingTools += ", React Testing Library";
    }
    testingTools += ", Playwright";

    claudeMdContent = claudeMdContent.replace(
      /- Testing: Bun, happy-dom,React Testing Library, Playwright, Maestro/s,
      `- Testing: ${testingTools}`,
    );

    // Write CLAUDE.md
    const claudeMdPath = path.join(projectPath, "CLAUDE.md");
    fs.writeFileSync(claudeMdPath, claudeMdContent);

    addMessage("success", `CLAUDE.md created at: ${claudeMdPath}`);
    setStep("done");
    setTimeout(() => exit(), 500);
  } catch (error: unknown) {
    let errorMessage = "Unknown error";
    if (typeof error === "object" && error !== null && "message" in error) {
      errorMessage = String((error as { message: unknown }).message);
    } else {
      errorMessage = String(error);
    }
    addMessage("error", `Failed to create CLAUDE.md: ${errorMessage}`);
    setStep("done");
    setTimeout(() => exit(), 500);
  }
}

// Handler function for use in index.ts
export async function handleProjectInit(): Promise<void> {
  const config = {
    root: process.cwd(),
    name: "relay",
    version: "2.1.0",
  } as unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmd = new ProjectInit([""], config as any);
  await cmd.run();
}
