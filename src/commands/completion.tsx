import { Args } from "@oclif/core";
import { Box } from "ink";
import { BaseCommand } from "../oclif/base";
import { Error as ErrorBadge, Info, Section } from "../ui/index";
import { select } from "../ui/prompts/index";
import { getShellCompletion } from "../utils/completion";

const SHELLS = ["bash", "zsh", "fish"] as const;
type Shell = (typeof SHELLS)[number];

export default class Completion extends BaseCommand<typeof Completion> {
  static description = "Generate shell completion scripts";
  static examples = [
    "<%= config.bin %> completion bash",
    "<%= config.bin %> completion zsh",
    "<%= config.bin %> completion fish",
  ];

  static args = {
    shell: Args.string({
      description: "Shell to generate completion for",
      required: false,
      options: [...SHELLS],
    }),
  };

  async run(): Promise<void> {
    let selectedShell = this.args.shell as Shell | undefined;

    if (!selectedShell) {
      selectedShell = await select("Select shell:", SHELLS, 0);
    }

    if (!SHELLS.includes(selectedShell)) {
      await this.renderApp(
        <Box>
          <ErrorBadge>
            Unsupported shell: {selectedShell}. Supported shells: {SHELLS.join(", ")}
          </ErrorBadge>
        </Box>,
      );
      return;
    }

    try {
      const completion = getShellCompletion(selectedShell);
      console.log(completion);

      await this.renderApp(<CompletionInfo shell={selectedShell} />);
    } catch (err) {
      await this.renderApp(
        <Box>
          <ErrorBadge>Failed to generate completion: {(err as Error).message}</ErrorBadge>
        </Box>,
      );
    }
  }
}

function CompletionInfo({ shell }: { shell: Shell }): React.ReactElement {
  return (
    <Section title="Shell Completion">
      <Box flexDirection="column">
        <Info>To enable {shell} completion, add the above to your shell configuration.</Info>
        <Info>For bash: Add to ~/.bashrc or ~/.bash_completion</Info>
        <Info>For zsh: Add to ~/.zshrc</Info>
        <Info>For fish: Add to ~/.config/fish/completions/relay.fish</Info>
      </Box>
    </Section>
  );
}
