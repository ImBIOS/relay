import { PasswordInput as InkPasswordInput } from "@inkjs/ui";
import { Box, render, Text, useApp } from "ink";
import { useState } from "react";

interface PasswordInputPromptProps {
  message: string;
  onSubmit: (value: string) => void;
}

function PasswordInputPrompt({
  message,
  onSubmit,
}: PasswordInputPromptProps): React.ReactElement {
  const { exit } = useApp();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (value: string) => {
    setSubmitted(true);
    onSubmit(value);
    exit();
  };

  if (submitted) {
    return (
      <Box>
        <Text color="cyan">? </Text>
        <Text>{message} </Text>
        <Text color="green">••••••••</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="cyan">? </Text>
      <Text>{message} </Text>
      <InkPasswordInput
        onSubmit={handleSubmit}
        placeholder="Enter password..."
      />
    </Box>
  );
}

/**
 * Show a password input prompt and return the user's input.
 * Replaces inquirer's password() function.
 */
export async function password(message: string): Promise<string> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      <PasswordInputPrompt message={message} onSubmit={resolve} />
    );
    waitUntilExit();
  });
}
