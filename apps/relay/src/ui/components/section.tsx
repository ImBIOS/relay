import { Box, Text } from "ink";
import type React from "react";

interface SectionProps {
  title: string;
  children?: React.ReactNode;
}

/**
 * Section component that displays a title with divider lines.
 * Replaces the old logger.section() function.
 */
export function Section({ title, children }: SectionProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginY={1}>
      <Text>{"─".repeat(50)}</Text>
      <Text bold> {title}</Text>
      <Text>{"─".repeat(50)}</Text>
      {children && <Box marginTop={1}>{children}</Box>}
    </Box>
  );
}
