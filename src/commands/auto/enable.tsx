import { BaseCommand } from "../../oclif/base";
import { configureRotation, type ProviderFilter, type RotationStrategy } from "../../config/accounts-config";
import { error, success } from "../../utils/console";

const VALID_STRATEGIES: RotationStrategy[] = ["least-used", "round-robin", "priority", "random"];
const VALID_FILTERS: ProviderFilter[] = ["same-provider", "cross-provider", "selected-providers"];

export default class AutoEnable extends BaseCommand<typeof AutoEnable> {
  static description = "Enable automatic provider rotation";
  static examples = [
    "<%= config.bin %> auto enable least-used cross-provider",
    "<%= config.bin %> auto enable round-robin same-provider",
    "<%= config.bin %> auto enable least-used selected-providers zai,minimax",
  ];

  async run(): Promise<void> {
    const strategy = (this.argv?.[0] as string | undefined) ?? "least-used";
    const providerFilter = (this.argv?.[1] as string | undefined) ?? "cross-provider";
    const providersArg = this.argv?.[2] as string | undefined;

    if (!VALID_STRATEGIES.includes(strategy as RotationStrategy)) {
      console.error(error(`Unknown strategy: ${strategy}`));
      console.error(`Valid strategies: ${VALID_STRATEGIES.join(", ")}`);
      this.exit(1);
    }

    if (!VALID_FILTERS.includes(providerFilter as ProviderFilter)) {
      console.error(error(`Unknown provider filter: ${providerFilter}`));
      console.error(`Valid filters: ${VALID_FILTERS.join(", ")}`);
      this.exit(1);
    }

    const allowedProviders = providerFilter === "selected-providers" && providersArg
      ? providersArg.split(",").map((s) => s.trim())
      : undefined;

    configureRotation(
      true,
      strategy as RotationStrategy,
      providerFilter as ProviderFilter,
      allowedProviders,
    );

    const filterLabel = allowedProviders && allowedProviders.length > 0
      ? `${providerFilter} (${allowedProviders.join(", ")})`
      : providerFilter;

    console.log("");
    console.log(success(`Auto rotation enabled (strategy: ${strategy}, filter: ${filterLabel}).`));
  }
}
