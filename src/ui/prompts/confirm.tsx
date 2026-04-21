import { ConfirmInput } from "@inkjs/ui";
import { Box, render, Text, useApp } from "ink";
import { useState } from "react";

interface ConfirmPromptProps {
  message: string;
  defaultValue?: boolean;
  onSubmit: (value: boolean) => void;
}

function ConfirmPrompt({
  message,
  defaultValue = true,
  onSubmit,
}: ConfirmPromptProps): React.ReactElement {
  const { exit } = useApp();
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  const handleConfirm = () => {
    setResult(true);
    setSubmitted(true);
    onSubmit(true);
    exit();
  };

  const handleCancel = () => {
    setResult(false);
    setSubmitted(true);
    onSubmit(false);
    exit();
  };

  if (submitted) {
    return (
      <Box>
        <Text color="cyan">? </Text>
        <Text>{message} </Text>
        <Text color="green">{result ? "Yes" : "No"}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="cyan">? </Text>
      <Text>{message} </Text>
      <ConfirmInput
        defaultChoice={defaultValue ? "confirm" : "cancel"}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </Box>
  );
}

/**
 * Show a confirm prompt and return the user's choice.
 * Replaces inquirer's confirm() function.
 */
export async function confirm(
  message: string,
  defaultValue = true
): Promise<boolean> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <ConfirmPrompt
        defaultValue={defaultValue}
        message={message}
        onSubmit={resolve}
      />
    );
    waitUntilExit();
  });
}
