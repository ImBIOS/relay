import { Box, Text } from "ink";
import type React from "react";

interface TableProps {
  data: Record<string, string | number>;
}

/**
 * Table component that displays key-value pairs in a formatted table.
 * Replaces the old logger.table() function.
 */
export function Table({ data }: TableProps): React.ReactElement {
  const entries = Object.entries(data);
  const maxKeyLength = Math.max(...entries.map(([k]) => k.length));
  const maxValLength = Math.max(...entries.map(([, v]) => String(v).length));

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {entries.map(([key, value]) => (
        <Box key={key}>
          <Text>{key.padEnd(maxKeyLength)}</Text>
          <Text color="gray"> → </Text>
          <Text>{String(value).padStart(maxValLength)}</Text>
        </Box>
      ))}
    </Box>
  );
}

interface TableRowProps {
  label: string;
  value: string | number;
  labelWidth?: number;
}

/**
 * Individual table row component for more flexible table layouts.
 */
export function TableRow({
  label,
  value,
  labelWidth = 20,
}: TableRowProps): React.ReactElement {
  return (
    <Box>
      <Text>{label.padEnd(labelWidth)}</Text>
      <Text color="gray"> → </Text>
      <Text>{String(value)}</Text>
    </Box>
  );
}
