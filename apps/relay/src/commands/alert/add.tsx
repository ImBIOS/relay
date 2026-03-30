import { Select, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import { loadConfig, saveConfig } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Section, Success } from "../../ui/index";

const TYPE_OPTIONS = [
  { label: "usage", value: "usage" },
  { label: "quota", value: "quota" },
];

export default class AlertAdd extends BaseCommand<typeof AlertAdd> {
  static description = "Add a new alert";
  static examples = ["<%= config.bin %> alert add"];

  async run(): Promise<void> {
    await this.renderApp(<AlertAddUI />);
  }
}

type AddStep = "type" | "threshold" | "done";

function AlertAddUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<AddStep>("type");
  const [type, setType] = useState<"usage" | "quota">("usage");
  const [threshold, setThreshold] = useState(80);

  const handleTypeChange = (value: string) => {
    setType(value as "usage" | "quota");
    setStep("threshold");
  };

  const handleThresholdSubmit = (value: string) => {
    const thresh = Number.parseInt(value, 10) || 80;
    setThreshold(thresh);

    const config = loadConfig();
    const alert = {
      id: `alert_${Date.now()}`,
      type,
      threshold: thresh,
      enabled: true,
    };
    config.alerts.push(alert);
    saveConfig(config);

    setStep("done");
    setTimeout(() => exit(), 500);
  };

  return (
    <Section title="Add Alert">
      <Box flexDirection="column">
        {step === "type" && (
          <Box flexDirection="column">
            <Text>Alert type:</Text>
            <Box paddingLeft={2}>
              <Select onChange={handleTypeChange} options={TYPE_OPTIONS} />
            </Box>
          </Box>
        )}

        {step === "threshold" && (
          <Box>
            <Text>Threshold (%): </Text>
            <TextInput defaultValue="80" onSubmit={handleThresholdSubmit} />
          </Box>
        )}

        {step === "done" && (
          <Success>
            Alert added: {type} @ {threshold}%
          </Success>
        )}
      </Box>
    </Section>
  );
}
