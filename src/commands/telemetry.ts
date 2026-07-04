import { join } from "node:path";
import { emitJson } from "../lib/cli/format";
import { readReadEvents } from "../lib/crp/analyzer";
import { getDefaultAdapter } from "../lib/hooks/adapter";
import { buildReportSummary, runReport } from "../lib/telemetry/reporter";

function countReadEvents(): number {
	// reads.jsonl is the canonical source, written by post-read.mjs.
	return readReadEvents(join(".crp", "telemetry", "reads.jsonl")).length;
}

export function cmdTelemetryStatus(): number {
	const projectDir = process.cwd();
	const adapter = getDefaultAdapter();
	const status = adapter.checkStatus(projectDir);
	console.log(
		`Telemetry hook: ${status.postReadActive ? "ACTIVE" : "INACTIVE"}`,
	);
	console.log(`Events recorded: ${countReadEvents()}`);
	return 0;
}

export function cmdTelemetryReport(options: { json?: boolean }): number {
	if (options.json) {
		const summary = buildReportSummary();
		if (summary === null) {
			emitJson({ error: "No crp.yaml found" });
			return 1;
		}
		emitJson(summary);
		return 0;
	}
	return runReport();
}
