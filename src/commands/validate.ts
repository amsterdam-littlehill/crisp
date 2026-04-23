import { loadManifest, validateManifest } from "../lib/manifest/io";

export function cmdValidate(): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		console.log("[ERROR] No crp.yaml found");
		console.log("         Impact: Cannot validate project structure");
		console.log("         Fix:    Run 'crp init' to create crp.yaml");
		return 1;
	}

	const errors = validateManifest(manifest);
	if (errors.length > 0) {
		for (const err of errors) {
			console.log(`[ERROR] ${err}`);
			console.log("         Impact: CRP tools may behave unexpectedly");
			console.log("         Fix:    Edit crp.yaml to correct the error");
		}
		return 1;
	}

	console.log("[OK] crp.yaml is valid");
	return 0;
}
