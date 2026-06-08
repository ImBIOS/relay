#!/usr/bin/env bun

const argv = process.argv.slice(2);

// Fast path for shell prompts (Starship, zsh RPROMPT). Skips oclif bootstrap (~150ms+).
if (argv[0] === "prompt") {
  const { runPromptFast } = await import("./prompt-fast");
  runPromptFast(argv.slice(1));
} else {
  const { flush, handle, run } = await import("@oclif/core");

  // oclif calls process.emitWarning() when no pre-built manifest exists.
  // Suppress those manifest-not-found warnings — expected in bun-native source installs.
  // oclif's addErrorScope() adds a `detail` property to the error; plain Node.js warnings don't have it.
  const _emitWarning = process.emitWarning.bind(process);
  process.emitWarning = (warning: string | Error, ...args: unknown[]) => {
    const opts = args[0];
    if (typeof opts === "object" && opts !== null && "detail" in opts) return;
    return (_emitWarning as (...a: unknown[]) => void)(warning, ...args);
  };

  await run(argv, import.meta.url)
    .catch(handle)
    .finally(async () => await flush());
}
