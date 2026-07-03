import { join } from "node:path";
import {
	checkHookStatus,
	injectHook,
	removeHook,
} from "../lib/telemetry/hooks";
import { buildReportSummary, runReport } from "../lib/telemetry/reporter";

const SETTINGS_PATH = join(".claude", "settings.json");

export function cmdTelemetryStart(): number {
	injectHook(SETTINGS_PATH);
	return 0;
}

export function cmdTelemetryStop(): number {
	removeHook(SETTINGS_PATH);
	return 0;
}

export function cmdTelemetryStatus(): number {
	const status = checkHookStatus(SETTINGS_PATH);
	console.log(`Telemetry hook: ${status.active ? "ACTIVE" : "INACTIVE"}`);
	console.log(`Events recorded: ${status.eventCount}`);
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
