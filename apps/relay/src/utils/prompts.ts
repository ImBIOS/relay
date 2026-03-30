import inquirer from "inquirer";

export async function confirm(
  message: string,
  defaultValue = true
): Promise<boolean> {
  const { result } = await inquirer.prompt([
    {
      type: "confirm",
      name: "result",
      message,
      default: defaultValue,
    },
  ]);
  return result;
}

export async function input(
  message: string,
  defaultValue = ""
): Promise<string> {
  const { result } = await inquirer.prompt([
    {
      type: "input",
      name: "result",
      message,
      default: defaultValue,
    },
  ]);
  return result;
}

export async function password(message: string): Promise<string> {
  const { result } = await inquirer.prompt([
    {
      type: "password",
      name: "result",
      message,
    },
  ]);
  return result;
}

export async function select<T extends string>(
  message: string,
  choices: readonly T[],
  defaultIndex = 0
): Promise<T> {
  const { result } = await inquirer.prompt([
    {
      type: "list",
      name: "result",
      message,
      choices: choices.map((c) => ({ name: c, value: c })),
      default: choices[defaultIndex],
    },
  ]);
  return result;
}

export async function checkbox<T extends string>(
  message: string,
  choices: readonly T[]
): Promise<T[]> {
  const { result } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "result",
      message,
      choices: choices.map((c) => ({ name: c, value: c })),
    },
  ]);
  return result;
}

export function providerSelection(): Promise<"zai" | "minimax"> {
  return select("Select API provider:", ["zai", "minimax"] as const, 0);
}

export function modelSelection(models: readonly string[]): Promise<string> {
  return select("Select model:", models, 0);
}
