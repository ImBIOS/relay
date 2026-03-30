import { Box, Text, useApp } from "ink";
import { useEffect } from "react";
import { BaseCommand } from "../oclif/base";

export default class Version extends BaseCommand<typeof Version> {
  static description = "Show version information";
  static examples = ["<%= config.bin %> version"];

  async run(): Promise<void> {
    const pkg = await import("../../package.json");
    await this.renderApp(<VersionUI version={pkg.version} />);
  }
}

function VersionUI({ version }: { version: string }): React.ReactElement {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => exit(), 100);
    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box>
      <Text>RELAY v{version}</Text>
    </Box>
  );
}
