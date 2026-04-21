import { render } from "ink";
import { useState } from "react";
import { BaseCommand } from "../../oclif/base";
import { Info, Section } from "../../ui/index";
import { getCompareSession, loadCompareHistory } from "../../utils/isolation";
import { HistoryList, SessionDetail } from "../compare-ui";

export default class CompareHistory extends BaseCommand<typeof CompareHistory> {
  static description = "List past comparisons";
  static examples = ["<%= config.bin %> compare history"];

  async run(): Promise<void> {
    const history = loadCompareHistory();

    if (history.length === 0) {
      await this.renderApp(
        <Section title="Comparison History">
          <Info>No comparison sessions found.</Info>
        </Section>
      );
      return;
    }

    const sessions = history.map((s) => ({
      id: s.id,
      timestamp: new Date(s.timestamp).toLocaleString(),
      prompt: s.prompt,
      winner: s.winner,
    }));

    // For now, render a simple history list
    const { waitUntilExit } = render(
      <HistoryListWrapper sessions={sessions} />
    );
    await waitUntilExit();
  }
}

interface SessionData {
  id: string;
  timestamp: string;
  prompt: string;
  winner?: string;
}

function HistoryListWrapper({
  sessions,
}: {
  sessions: SessionData[];
}): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);

  if (viewSessionId) {
    const session = getCompareSession(viewSessionId);
    if (session) {
      return (
        <SessionDetail
          onBack={() => setViewSessionId(null)}
          session={{
            ...session,
            timestamp: new Date(session.timestamp).toLocaleString(),
          }}
        />
      );
    }
  }

  return (
    <HistoryList
      onSelect={setSelectedIndex}
      onView={setViewSessionId}
      selectedIndex={selectedIndex}
      sessions={sessions}
    />
  );
}
