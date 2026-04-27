import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";

interface Option {
  label: string;
  value: string;
}

interface CustomMultiSelectProps {
  options: readonly Option[];
  defaultValue?: string[];
  onSubmit: (values: string[]) => void;
}

export function CustomMultiSelect({
  options,
  defaultValue = [],
  onSubmit,
}: CustomMultiSelectProps): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValue));
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Reset focused index when options change
  useEffect(() => {
    if (focusedIndex >= options.length) {
      setFocusedIndex(Math.max(0, options.length - 1));
    }
  }, [options.length, focusedIndex]);

  useInput((input, key) => {
    if (key.return) {
      // Submit on Enter
      onSubmit(Array.from(selected));
      return;
    }

    if (input === " ") {
      // Space to toggle selection
      const currentOption = options[focusedIndex];
      const newSelected = new Set(selected);
      if (newSelected.has(currentOption.value)) {
        newSelected.delete(currentOption.value);
      } else {
        newSelected.add(currentOption.value);
      }
      setSelected(newSelected);
      return;
    }

    if (key.upArrow) {
      setFocusedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setFocusedIndex((prev) => Math.min(options.length - 1, prev + 1));
      return;
    }
  });

  return (
    <Box flexDirection="column">
      {options.map((option, index) => {
        const isSelected = selected.has(option.value);
        const isFocused = index === focusedIndex;

        return (
          <Box key={option.value}>
            <Text>
              {isFocused ? "❯ " : "  "}
              {isSelected ? "[✓] " : "[ ] "}
            </Text>
            <Text bold={isFocused} color={isFocused ? "cyan" : undefined}>
              {option.label}
            </Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color="gray">[↑/↓] Navigate &nbsp; [Space] Toggle &nbsp; [Enter] Confirm</Text>
      </Box>
    </Box>
  );
}

interface MultiSelectPromptProps<T extends string> {
  message: string;
  choices: readonly T[];
  defaultValues?: T[];
  onSubmit: (values: T[]) => void;
}

function MultiSelectPrompt<T extends string>({
  message,
  choices,
  defaultValues = [],
  onSubmit,
}: MultiSelectPromptProps<T>): React.ReactElement {
  const { exit } = useApp();
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<T[]>([]);

  const options = choices.map((choice) => ({
    label: choice,
    value: choice,
  }));

  const handleSubmit = (values: string[]) => {
    setResult(values as T[]);
    setSubmitted(true);
    onSubmit(values as T[]);
    exit();
  };

  if (submitted) {
    return (
      <Box>
        <Text color="cyan">? </Text>
        <Text>{message} </Text>
        <Text color="green">{result.join(", ")}</Text>
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
        <CustomMultiSelect defaultValue={defaultValues} onSubmit={handleSubmit} options={options} />
      </Box>
    </Box>
  );
}

/**
 * Show a multi-select prompt and return the user's choices.
 * Replaces inquirer's checkbox() function.
 */
export async function checkbox<T extends string>(
  message: string,
  choices: readonly T[],
  defaultValues: T[] = [],
): Promise<T[]> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <MultiSelectPrompt
        choices={choices}
        defaultValues={defaultValues}
        message={message}
        onSubmit={resolve}
      />,
    );
    waitUntilExit();
  });
}
