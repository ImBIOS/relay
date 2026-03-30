// project command - Project management (init, doctor, config, first-run)

export async function handleProject(args: string[]): Promise<void> {
  const action = args[0] as string | undefined;

  switch (action) {
    case "init": {
      const { handleProjectInit } = await import("./init.js");
      await handleProjectInit();
      break;
    }

    case "doctor": {
      const { handleProjectDoctor } = await import("./doctor.js");
      await handleProjectDoctor();
      break;
    }

    case "config": {
      console.log(`
ImBIOS Project Configuration

This command will help you configure project-specific settings.

Commands:
  init          Initialize a new project with CLAUDE.md
  doctor        Check project health and diagnose issues
  first-run     Run the first-time setup wizard

Usage:
  relay project init          # Create CLAUDE.md from template
  relay project doctor        # Check project health
  relay project first-run     # Run setup wizard

Examples:
  relay project init          # Initialize in current directory
  relay project doctor ~/myapp # Check ~/myapp project
`);
      break;
    }

    case "first-run": {
      const { default: FirstRun } = await import("../first-run.js");
      const config = {
        root: process.cwd(),
        name: "relay",
        version: "2.1.0",
      } as unknown;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cmd = new FirstRun([""], config as any);
      await cmd.run();
      break;
    }

    default: {
      console.log(`
ImBIOS Project Management

Commands:
  init          Initialize a new project with CLAUDE.md
  doctor        Check project health and diagnose issues
  config        Configure project settings
  first-run     Run the first-time setup wizard

Usage:
  relay project <command> [options]

Examples:
  relay project init          # Create CLAUDE.md from template
  relay project doctor        # Check project health
  relay project first-run     # Run setup wizard

For more info, visit: https://github.com/ImBIOS/coding-helper
`);
    }
  }
}
