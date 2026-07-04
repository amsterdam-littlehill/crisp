import { readFileSync } from "node:fs";
import { emitJson, printError, printOk, printWarn } from "../lib/cli/format";
import { computeQualityScore, isProductionReady } from "../lib/quality/scorer";

export function cmdCrpQuality(
	file: string,
	options: { json?: boolean } = {},
): number {
	let text: string;
	try {
		text = readFileSync(file, "utf-8");
	} catch {
		if (options.json) {
			emitJson({ error: `File not found: ${file}` });
			return 1;
		}
		printError("File not found", file, "Check the file path and try again.");
		return 1;
	}

	const score = computeQualityScore(text);
	const ready = isProductionReady(score);

	if (options.json) {
		emitJson({ ...score, production_ready: ready });
		return 0;
	}

	const label = ready ? "Production Ready" : "Not Production Ready";
	if (ready) {
		printOk(`${label} — score ${score.overall}/10`);
	} else {
		printWarn(`${label} — score ${score.overall}/10 (min 7.0)`);
	}

	console.log("  Dimensions:");
	console.log(`    density:            ${score.density}`);
	console.log(`    interference:       ${score.interference}`);
	console.log(`    explicit_ratio:     ${score.explicit_ratio}`);
	console.log(`    attention_align:    ${score.attention_alignment}`);
	console.log(`    completeness:       ${score.completeness}`);
	console.log(`    freshness:          ${score.freshness}`);
	console.log(`    enrichment:         ${score.enrichment}`);
	console.log(`    cross_references:   ${score.cross_references}`);

	return 0;
}
