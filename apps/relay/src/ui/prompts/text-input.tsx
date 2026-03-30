import { TextInput as InkTextInput } from "@inkjs/ui";
import { Box, render, Text, useApp } from "ink";
import { useState } from "react";

interface TextInputPromptProps {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

function TextInputPrompt({
  message,
  defaultValue = "",
  placeholder,
  onSubmit,
}: TextInputPromptProps): React.ReactElement {
  const { exit } = useApp();
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = (value: string) => {
    const finalValue = value || defaultValue;
    setResult(finalValue);
    setSubmitted(true);
    onSubmit(finalValue);
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
    <Box>
      <Text color="cyan">? </Text>
      <Text>{message} </Text>
      <InkTextInput
        defaultValue={defaultValue}
        onSubmit={handleSubmit}
        placeholder={placeholder || defaultValue}
      />
    </Box>
  );
}

/**
 * Show a text input prompt and return the user's input.
 * Replaces inquirer's input() function.
 */
export async function input(
  message: string,
  defaultValue = ""
): Promise<string> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <TextInputPrompt
        defaultValue={defaultValue}
        message={message}
        onSubmit={resolve}
      />
    );
    waitUntilExit();
  });
}
