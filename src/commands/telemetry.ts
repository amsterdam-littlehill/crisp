import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitJson } from "../lib/cli/format";
import { getDefaultAdapter } from "../lib/hooks/adapter";
import { buildReportSummary, runReport } from "../lib/telemetry/reporter";

function countReadEvents(): number {
	// reads.jsonl is the canonical source, written by post-read.mjs. Counts
	// non-empty lines (NOT parsed events) — preserves the original status
	// semantics; this is a line counter, distinct from the shared readReadEvents
	// parser used by reporter/analyzer.
	const readsPath = join(".crp", "telemetry", "reads.jsonl");
	if (!existsSync(readsPath)) return 0;
	try {
		const content = readFileSync(readsPath, "utf-8").trim();
		if (!content) return 0;
		return content.split("\n").filter(Boolean).length;
	} catch {
		return 0;
	}
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
