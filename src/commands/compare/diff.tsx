import { Args } from "@oclif/core";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Section } from "../../ui/index";
import { getCompareSession } from "../../utils/isolation";

export default class CompareDiff extends BaseCommand<typeof CompareDiff> {
  static description = "Compare two comparison sessions";
  static examples = ["<%= config.bin %> compare diff session1 session2"];

  static args = {
    id1: Args.string({
      description: "First session ID",
      required: true,
    }),
    id2: Args.string({
      description: "Second session ID",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { id1, id2 } = this.args;

    const session1 = getCompareSession(id1);
    const session2 = getCompareSession(id2);

    if (!(session1 && session2)) {
      await this.renderApp(
        <Box>
          <ErrorBadge>One or both sessions not found.</ErrorBadge>
        </Box>
      );
      return;
    }

    await this.renderApp(
      <DiffUI id1={id1} id2={id2} session1={session1} session2={session2} />
    );
  }
}

interface Session {
  zaiResult?: { timeMs: number };
  minimaxResult?: { timeMs: number };
  winner?: string;
}

interface DiffUIProps {
  id1: string;
  id2: string;
  session1: Session;
  session2: Session;
}

function DiffUI({
  id1,
  id2,
  session1,
  session2,
}: DiffUIProps): React.ReactElement {
  return (
    <Section title="Session Comparison">
      <Box flexDirection="column">
        <Text>Session 1: {id1}</Text>
        <Text>Session 2: {id2}</Text>
        <Box marginTop={1} />

        {session1.zaiResult && session2.zaiResult && (
          <Text>
            Z.AI Time Diff:{" "}
            {(
              (session1.zaiResult.timeMs - session2.zaiResult.timeMs) /
              1000
            ).toFixed(2)}
            s
          </Text>
        )}

        {session1.minimaxResult && session2.minimaxResult && (
          <Text>
            MiniMax Time Diff:{" "}
            {(
              (session1.minimaxResult.timeMs - session2.minimaxResult.timeMs) /
              1000
            ).toFixed(2)}
            s
          </Text>
        )}

        <Box marginTop={1} />
        <Text>Winner 1: {session1.winner || "N/A"}</Text>
        <Text>Winner 2: {session2.winner || "N/A"}</Text>
      </Box>
    </Section>
  );
}
