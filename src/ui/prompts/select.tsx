import { Select as InkSelect } from "@inkjs/ui";
import { Box, render, Text, useApp } from "ink";
import { useState } from "react";

interface SelectPromptProps<T extends string> {
  message: string;
  choices: readonly T[];
  defaultIndex?: number;
  onSubmit: (value: T) => void;
}

function SelectPrompt<T extends string>({
  message,
  choices,
  defaultIndex = 0,
  onSubmit,
}: SelectPromptProps<T>): React.ReactElement {
  const { exit } = useApp();
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<T | null>(null);

  const options = choices.map((choice) => ({
    label: choice,
    value: choice,
  }));

  const handleChange = (value: string) => {
    setResult(value as T);
    setSubmitted(true);
    onSubmit(value as T);
    exit();
  };

  if (submitted) {
    return (
      <Box>
        <Text color="cyan">? </Text>
        <Text>{message} </Text>
        <Text color="green">{result}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">? </Text>
        <Text>{message}</Text>
      </Box>
      <Box paddingLeft={2}>
        <InkSelect
          defaultValue={choices[defaultIndex]}
          onChange={handleChange}
          options={options}
        />
      </Box>
    </Box>
  );
}

/**
 * Show a select prompt and return the user's choice.
 * Replaces inquirer's list() function.
 */
export async function select<T extends string>(
  message: string,
  choices: readonly T[],
  defaultIndex = 0
): Promise<T> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <SelectPrompt
        choices={choices}
        defaultIndex={defaultIndex}
        message={message}
        onSubmit={resolve}
      />
    );
    waitUntilExit();
  });
}
