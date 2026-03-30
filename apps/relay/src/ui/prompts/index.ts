export { confirm } from "./confirm";
export { checkbox } from "./multi-select";
export { password } from "./password-input";
export { select } from "./select";
export { input } from "./text-input";

// Re-export convenience functions for provider and model selection
export async function providerSelection(): Promise<"zai" | "minimax"> {
  const { select } = await import("./select.js");
  return select("Select API provider:", ["zai", "minimax"] as const, 0);
}

export async function modelSelection(
  models: readonly string[]
): Promise<string> {
  const { select } = await import("./select.js");
  return select("Select model:", models, 0);
}
