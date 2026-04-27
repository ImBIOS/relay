import { Args } from "@oclif/core";
import { Box } from "ink";
import type React from "react";
import { BaseCommand } from "../oclif/base";
import { Info, Section, Table, Warning } from "../ui/index";

/**
 * Model cost estimates (per 1K tokens)
 * TODO: add JSDoc link to re-check each model costs
 */
const COSTS: Record<string, number> = {
  "GLM-5": 0.000_15,
  "GLM-4.7": 0.0001,
  "GLM-4.5-Air": 0.000_05,
  "MiniMax-M2.5": 0.0001,
  "MiniMax-M2.1": 0.000_08,
} as const;

const MODELS = Object.keys(COSTS) as readonly string[];
const DEFAULT_MODEL = "GLM-5";

export default class Cost extends BaseCommand<typeof Cost> {
  static description = "Estimate cost for a model";
  static examples = [
    "<%= config.bin %> cost",
    "<%= config.bin %> cost GLM-5",
    "<%= config.bin %> cost MiniMax-M2.5",
  ];

  static args = {
    model: Args.string({
      description: "Model to estimate cost for",
      required: false,
    }),
  };

  async run(): Promise<void> {
    let selectedModel = this.args.model;

    if (!selectedModel) {
      // Use default model in non-interactive mode
      selectedModel = DEFAULT_MODEL;
    }

    const cost = COSTS[selectedModel];

    if (!cost) {
      await this.renderApp(
        <Box flexDirection="column">
          <Warning>Unknown model: {selectedModel}</Warning>
          <Info>Available models: {MODELS.join(", ")}</Info>
        </Box>,
      );
      return;
    }

    await this.renderApp(<CostUI cost={cost} model={selectedModel} />);
  }
}

interface CostUIProps {
  model: string;
  cost: number;
}

function CostUI({ model, cost }: CostUIProps): React.ReactElement {
  return (
    <Section title="Cost Estimation">
      <Table
        data={{
          Model: model,
          "Input (1K tokens)": `$${(cost * 1000).toFixed(6)}`,
          "Output (1K tokens)": `$${(cost * 1000 * 2).toFixed(6)}`,
        }}
      />
    </Section>
  );
}
