import { Args } from "@oclif/core";
import { Box, render } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info } from "../../ui/index";
import { getCompareSession } from "../../utils/isolation";
import { SessionDetail } from "../compare-ui";

export default class CompareView extends BaseCommand<typeof CompareView> {
  static description = "View a specific comparison session";
  static examples = ["<%= config.bin %> compare view abc123"];

  static args = {
    id: Args.string({
      description: "Session ID to view",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const sessionId = this.args.id;
    const session = getCompareSession(sessionId);

    if (!session) {
      await this.renderApp(
        <Box flexDirection="column">
          <ErrorBadge>Session not found: {sessionId}</ErrorBadge>
          <Info>Use 'relay compare history' to list sessions.</Info>
        </Box>,
      );
      return;
    }

    const { waitUntilExit } = render(
      <SessionDetail
        onBack={() => {
          // Exit will happen when component unmounts
        }}
        session={{
          ...session,
          timestamp: new Date(session.timestamp).toLocaleString(),
        }}
      />,
    );

    await waitUntilExit();
  }
}
