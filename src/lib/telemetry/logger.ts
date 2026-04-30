import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TelemetryEvent {
	timestamp: string;
	event_type: string;
	file: string;
	skill: string;
	tokens: number;
	tier: string;
	load_reason?: string;
	skip_reason?: string;
	last_loaded_round?: number;
	rounds_since?: number;
}

export function recordReadEvent(event: TelemetryEvent): void {
	const logPath = join(".crp", "telemetry", "log.jsonl");
	const dir = dirname(logPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const record: Record<string, unknown> = {
		timestamp: event.timestamp || new Date().toISOString(),
		event_type: event.event_type,
		file: event.file,
		skill: event.skill,
		tokens: event.tokens,
		tier: event.tier,
		load_reason: event.load_reason || "",
	};

	appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
}

export function loadTelemetryLog(
	logPath?: string,
): Array<Record<string, unknown>> {
	const path = logPath || join(".crp", "telemetry", "log.jsonl");
	if (!existsSync(path)) return [];

	const events: Array<Record<string, unknown>> = [];
	const content = readFileSync(path, "utf-8").trim();
	if (!content) return [];

	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		try {
			events.push(JSON.parse(line));
		} catch {}
	}
	return events;
}

export function getLogStats(logPath?: string): Record<string, unknown> {
	const events = loadTelemetryLog(logPath);
	const readEvents = events.filter((e) => e.event_type === "READ");
	const totalTokens = readEvents.reduce(
		(sum, e) => sum + ((e.tokens as number) || 0),
		0,
	);

	const fileCounts: Record<string, number> = {};
	for (const e of readEvents) {
		const f = (e.file as string) || "unknown";
		fileCounts[f] = (fileCounts[f] || 0) + 1;
	}

	const topFiles = Object.entries(fileCounts)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10)
		.map(([file, count]) => ({ file, count }));

	return {
		total_events: events.length,
		total_reads: readEvents.length,
		total_tokens: totalTokens,
		top_files: topFiles,
	};
}
