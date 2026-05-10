import { BaseCommand } from "../oclif/base";

export default class Version extends BaseCommand<typeof Version> {
  static description = "Show version information";
  static examples = ["<%= config.bin %> version"];

  async run(): Promise<void> {
    const pkg = await import("../../package.json");
    console.log(`RELAY v${pkg.version}`);
  }
}
