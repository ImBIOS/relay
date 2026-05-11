import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { join } from "node:path";
import {
  loadRegistry,
  listPatches,
  listFeatures,
  validatePatch,
} from "./core";
import type { ValidationError } from "./core";
import {
  divider,
  ok,
  warn,
  heading,
  success,
  error as errIcon,
} from "../../utils/console";

export default class PatchValidate extends BaseCommand<typeof PatchValidate> {
  static description = "Validate all patch files for correctness and completeness";

  static flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
    strict: Flags.boolean({
      description: "Treat warnings as errors",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchValidate);

    console.log("");
    console.log(heading("relay patch validate"));
    console.log(divider());

    const registry = loadRegistry();
    const patches = listPatches();
    const features = listFeatures();
    const allErrors: Array<{ file: string; errors: ValidationError[] }> = [];

    if (patches.length === 0 && features.length === 0) {
      console.log(ok("No features or patches found."));
      return;
    }

    // Validate each patch file
    for (const slug of patches) {
      const patchPath = join(".relay", "features", slug, "patch.md");
      const errors = validatePatch(patchPath);
      allErrors.push({ file: slug, errors });

      if (errors.length === 0) {
        console.log(success(`${slug}: valid`));
      } else {
        for (const e of errors) {
          const icon = e.severity === "error" ? errIcon("") : warn("");
          const label = e.severity === "error" ? "ERROR" : "WARN";
          console.log(`  ${icon} ${slug}: [${label}] ${e.message}`);
        }
      }
    }

    // Check features without patches
    for (const slug of features) {
      if (!patches.includes(slug)) {
        console.log(warn(`${slug}: feature directory exists but no patch.md`));
      }
    }

    // Check registry consistency
    for (const feature of registry.features) {
      const slug = `${feature.id}-${feature.slug}`;
      const hasPatch = patches.includes(slug) || patches.includes(feature.slug);

      if (feature.hasPatch && !hasPatch) {
        console.log(errIcon(`Registry says ${slug} has patch, but no patch.md found`));
        allErrors.push({
          file: "registry.json",
          errors: [
            { file: "registry.json", message: `${slug} hasPatch=true but no patch.md`, severity: "error" },
          ],
        });
      }

      if (!feature.hasPatch && hasPatch) {
        console.log(warn(`Registry says ${slug} has no patch, but patch.md exists`));
      }

      // Check dependencies exist
      for (const depId of feature.dependsOn ?? []) {
        const dep = registry.features.find((f) => f.id === depId);
        if (!dep) {
          console.log(errIcon(`${slug} depends on ${depId}, which is not in registry`));
          allErrors.push({
            file: "registry.json",
            errors: [
              {
                file: "registry.json",
                message: `${slug} depends on non-existent feature ${depId}`,
                severity: "error",
              },
            ],
          });
        }
      }
    }

    // Summary
    const totalErrors = allErrors.reduce(
      (sum, e) => sum + e.errors.filter((e) => e.severity === "error").length,
      0,
    );
    const totalWarnings = allErrors.reduce(
      (sum, e) => sum + e.errors.filter((e) => e.severity === "warning").length,
      0,
    );

    console.log("");
    console.log(divider());
    if (totalErrors === 0 && totalWarnings === 0) {
      console.log(success(`All ${patches.length} patches valid.`));
    } else {
      if (totalErrors > 0) {
        console.log(errIcon(`${totalErrors} error(s) found.`));
      }
      if (totalWarnings > 0) {
        console.log(warn(`${totalWarnings} warning(s) found.`));
      }
      if (flags.strict && totalWarnings > 0) {
        console.log(errIcon("Strict mode: warnings treated as errors."));
      }
    }

    if (flags.json) {
      console.log("");
      console.log(JSON.stringify(allErrors, null, 2));
    }

    console.log("");

    // Exit with error if errors found
    if (totalErrors > 0 || (flags.strict && totalWarnings > 0)) {
      process.exitCode = 1;
    }
  }
}
