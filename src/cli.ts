#!/usr/bin/env node

const CLIController = async () => {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  try {
    const { loadCommand } = await import("./commands/loader.js");
    await loadCommand(command, args.slice(1));
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot find module")
    ) {
      console.error(`Unknown command: ${command}`);
      console.log('Run "relay help" for available commands.');
    } else {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(1);
  }
};

CLIController();
