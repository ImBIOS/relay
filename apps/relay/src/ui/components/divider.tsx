import { Box, Text } from "ink";
import type React from "react";

interface DividerProps {
  width?: number;
  char?: string;
}

/**
 * Divider component for visual separation.
 * Replaces the old logger.divider() function.
 */
export function Divider({
  width = 50,
  char = "─",
}: DividerProps): React.ReactElement {
  return (
    <Box marginY={1}>
      <Text color="gray">{char.repeat(width)}</Text>
    </Box>
  );
}

/**
 * Empty line for spacing.
 */
export function Spacer(): React.ReactElement {
  return <Box marginY={1} />;
}
