import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDefaultAdapter } from "../lib/hooks/adapter";
import { buildReportSummary, runReport } from "../lib/telemetry/reporter";

function countReadEvents(): number {
	// reads.jsonl is the canonical source, written by post-read.mjs.
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

export function cmdTelemetryReport(options: {
	skill?: string | null;
	json?: boolean;
}): number {
	if (options.json) {
		const summary = buildReportSummary(options.skill || null);
		if (summary === null) {
			console.log(JSON.stringify({ error: "No crp.yaml found" }, null, 2));
			return 1;
		}
		console.log(JSON.stringify(summary, null, 2));
		return 0;
	}
	return runReport(options.skill || null);
}
