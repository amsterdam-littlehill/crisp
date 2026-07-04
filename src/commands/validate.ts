import { emitJson, printError, printOk } from "../lib/cli/format";
import {
	loadManifest,
	manifestPath,
	validateManifest,
} from "../lib/manifest/io";

export function cmdValidate(options: { json?: boolean } = {}): number {
	const manifest = loadManifest(manifestPath());
	if (!manifest.project) {
		if (options.json) {
			emitJson({ valid: false, errors: ["No crp.yaml found"] });
			return 1;
		}
		printError(
			"No crp.yaml found",
			"Cannot validate project structure",
			"Run 'crp init' to create crp.yaml",
		);
		return 1;
	}

	const errors = validateManifest(manifest);

	if (options.json) {
		emitJson({ valid: errors.length === 0, errors });
		return errors.length === 0 ? 0 : 1;
	}

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
