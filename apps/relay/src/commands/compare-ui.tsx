import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import type { ClaudeResult } from "../utils/isolation";

interface ComparePanelProps {
  title: string;
  color: "blue" | "green";
  result: ClaudeResult | null;
  isActive: boolean;
  isComplete: boolean;
}

function ComparePanel({
  title,
  color,
  result,
  isActive,
  isComplete,
}: ComparePanelProps): React.ReactElement {
  return (
    <Box
      borderColor={color}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      width="50%"
    >
      <Box marginBottom={1}>
        <Text bold color={color}>
          {title}
        </Text>
      </Box>

      {!result && isActive && (
        <Box>
          <Text color="yellow">●</Text>
          <Text> Initializing...</Text>
        </Box>
      )}

      {!(result || isActive) && (
        <Box>
          <Text color="gray">○</Text>
          <Text> Waiting...</Text>
        </Box>
      )}

      {result?.error && (
        <Box flexDirection="column">
          <Text color="red">Error:</Text>
          <Text>{result.error}</Text>
        </Box>
      )}

      {result && !result.error && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={isComplete ? "green" : "yellow"}>
              {isComplete ? "●" : "○"}
            </Text>
            <Text> {isComplete ? "Complete" : "Running..."}</Text>
          </Box>

          {result.timeMs > 0 && (
            <Text>Time: {(result.timeMs / 1000).toFixed(2)}s</Text>
          )}

          {result.tokens !== undefined && (
            <Text>Tokens: {result.tokens.toLocaleString()}</Text>
          )}

          {result.cost !== undefined && (
            <Text>Cost: ${result.cost.toFixed(6)}</Text>
          )}

          <Box marginTop={1}>
            <Text>Output preview:</Text>
          </Box>
          <Box borderStyle="single" height={10} paddingLeft={1}>
            <Text>
              {result.output.slice(0, 500)}
              {result.output.length > 500 && "..."}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

interface CompareUIProps {
  prompt: string;
  zaiResult: ClaudeResult | null;
  minimaxResult: ClaudeResult | null;
  onCancel: () => void;
  winner: "zai" | "minimax" | "tie" | null;
}

export function CompareUI({
  prompt,
  zaiResult,
  minimaxResult,
  onCancel,
  winner,
}: CompareUIProps): React.ReactElement {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || (key.return && zaiResult && minimaxResult)) {
      exit();
    }
    if (input === "\x03") {
      // Ctrl+C
      onCancel();
      exit();
    }
  });

  const isComplete = !!zaiResult && !!minimaxResult;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>ImBIOS Provider Comparison</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">Prompt: </Text>
        <Text>
          {prompt.slice(0, 60)}
          {prompt.length > 60 && "..."}
        </Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        <ComparePanel
          color="blue"
          isActive={!(zaiResult || isComplete)}
          isComplete={!!zaiResult}
          result={zaiResult}
          title="Z.AI (GLM)"
        />
        <Box width="1" />
        <ComparePanel
          color="green"
          isActive={!(minimaxResult || isComplete)}
          isComplete={!!minimaxResult}
          result={minimaxResult}
          title="MiniMax"
        />
      </Box>

      {isComplete && (
        <Box borderColor="magenta" borderStyle="round" flexDirection="column">
          <Box paddingX={1}>
            <Text bold>Result: </Text>
            {winner === "zai" && <Text color="blue">Z.AI wins!</Text>}
            {winner === "minimax" && <Text color="green">MiniMax wins!</Text>}
            {winner === "tie" && <Text color="yellow">It's a tie!</Text>}
          </Box>

          {zaiResult && minimaxResult && (
            <Box paddingX={1}>
              <Text>
                Z.AI: {(zaiResult.timeMs / 1000).toFixed(2)}s vs MiniMax:{" "}
                {(minimaxResult.timeMs / 1000).toFixed(2)}s
              </Text>
            </Box>
          )}

          <Box paddingBottom={1} paddingX={1}>
            <Text color="gray">Press Q or Enter to exit</Text>
          </Box>
        </Box>
      )}

      {!isComplete && (
        <Box>
          <Text color="gray">Press Ctrl+C to cancel</Text>
        </Box>
      )}
    </Box>
  );
}

interface HistoryItemProps {
  id: string;
  timestamp: string;
  prompt: string;
  winner: string | undefined;
  isSelected: boolean;
}

export function HistoryItem({
  id,
  timestamp,
  prompt,
  winner,
  isSelected,
}: HistoryItemProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box>
        <Text color={isSelected ? "green" : undefined}>
          {isSelected ? ">" : " "}
        </Text>
        <Text bold>{id.slice(0, 12)}</Text>
        <Text color="gray"> {timestamp}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text color="gray">
          {prompt.slice(0, 50)}
          {prompt.length > 50 && "..."}
        </Text>
      </Box>
      <Box paddingLeft={2}>
        {winner === "zai" && <Text color="blue">Winner: Z.AI</Text>}
        {winner === "minimax" && <Text color="green">Winner: MiniMax</Text>}
        {winner === "tie" && <Text color="yellow">Tie</Text>}
        {!winner && <Text color="gray">No result</Text>}
      </Box>
    </Box>
  );
}

interface HistoryListProps {
  sessions: Array<{
    id: string;
    timestamp: string;
    prompt: string;
    winner?: string;
  }>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onView: (id: string) => void;
}

export function HistoryList({
  sessions,
  selectedIndex,
  onSelect,
  onView,
}: HistoryListProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.upArrow) {
      onSelect(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onSelect(Math.min(sessions.length - 1, selectedIndex + 1));
    } else if (key.return && sessions[selectedIndex]) {
      onView(sessions[selectedIndex].id);
    }
  });

  return (
    <Box flexDirection="column">
      <Box padding={1}>
        <Text bold>Comparison History</Text>
      </Box>
      {sessions.length === 0 ? (
        <Box padding={2}>
          <Text color="gray">No comparison sessions found.</Text>
        </Box>
      ) : (
        sessions.map((session, index) => (
          <HistoryItem
            id={session.id}
            isSelected={index === selectedIndex}
            key={session.id}
            prompt={session.prompt}
            timestamp={session.timestamp}
            winner={session.winner}
          />
        ))
      )}
      <Box padding={1}>
        <Text color="gray">
          Use arrow keys to navigate, Enter to view details
        </Text>
      </Box>
    </Box>
  );
}

interface SessionDetailProps {
  session: {
    id: string;
    timestamp: string;
    prompt: string;
    zaiResult?: ClaudeResult;
    minimaxResult?: ClaudeResult;
    winner?: string;
  };
  onBack: () => void;
}

export function SessionDetail({
  session,
  onBack,
}: SessionDetailProps): React.ReactElement {
  useInput((input) => {
    if (input === "q" || input === "\x1b") {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Session: {session.id}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">Time: </Text>
        <Text>{session.timestamp}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">Prompt: </Text>
        <Text>{session.prompt}</Text>
      </Box>

      {session.winner && (
        <Box marginBottom={1}>
          <Text bold>Winner: </Text>
          {session.winner === "zai" && <Text color="blue">Z.AI</Text>}
          {session.winner === "minimax" && <Text color="green">MiniMax</Text>}
          {session.winner === "tie" && <Text color="yellow">Tie</Text>}
        </Box>
      )}

      <Box borderStyle="round" marginBottom={1}>
        <Box paddingX={1}>
          <Text bold color="blue">
            Z.AI Result
          </Text>
        </Box>
        {session.zaiResult ? (
          <Box flexDirection="column" paddingX={1}>
            <Text>Time: {(session.zaiResult.timeMs / 1000).toFixed(2)}s</Text>
            {session.zaiResult.error ? (
              <Text color="red">Error: {session.zaiResult.error}</Text>
            ) : (
              <Box height={15} paddingTop={1}>
                <Text>{session.zaiResult.output.slice(0, 1000)}</Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box paddingX={1}>
            <Text color="gray">No result</Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="round" marginBottom={1}>
        <Box paddingX={1}>
          <Text bold color="green">
            MiniMax Result
          </Text>
        </Box>
        {session.minimaxResult ? (
          <Box flexDirection="column" paddingX={1}>
            <Text>
              Time: {(session.minimaxResult.timeMs / 1000).toFixed(2)}s
            </Text>
            {session.minimaxResult.error ? (
              <Text color="red">Error: {session.minimaxResult.error}</Text>
            ) : (
              <Box height={15} paddingTop={1}>
                <Text>{session.minimaxResult.output.slice(0, 1000)}</Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box paddingX={1}>
            <Text color="gray">No result</Text>
          </Box>
        )}
      </Box>

      <Box>
        <Text color="gray">Press Q to go back</Text>
      </Box>
    </Box>
  );
}
