import { printError, printOk } from "../lib/cli/format";
import { loadManifest, validateManifest } from "../lib/manifest/io";

export function cmdValidate(): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		printError(
			"No crp.yaml found",
			"Cannot validate project structure",
			"Run 'crp init' to create crp.yaml",
		);
		return 1;
	}

	const errors = validateManifest(manifest);
	if (errors.length > 0) {
		for (const err of errors) {
			printError(
				err,
				"CRP tools may behave unexpectedly",
				"Edit crp.yaml to correct the error",
			);
		}
		return 1;
	}

	printOk("crp.yaml is valid");
	return 0;
}
