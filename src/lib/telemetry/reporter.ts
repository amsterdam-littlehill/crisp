import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "../manifest/io";
import { loadTelemetryLog } from "./logger";

export function deriveSkipEvents(
	kgPath: string,
	sessionPath: string,
	taskType?: string | null,
): Array<Record<string, unknown>> {
	if (!existsSync(kgPath) || !existsSync(sessionPath)) return [];

	let kg: Record<string, unknown>;
	let session: Record<string, unknown>;
	try {
		kg = JSON.parse(readFileSync(kgPath, "utf-8"));
		session = JSON.parse(readFileSync(sessionPath, "utf-8"));
	} catch {
		return [];
	}

	const kgNodes = (kg.nodes as Record<string, unknown>) || {};
	const kgFiles = (kgNodes.files as Array<Record<string, unknown>>) || [];
	const fileNodes: Record<string, Record<string, unknown>> = {};
	for (const f of kgFiles) {
		fileNodes[f.id as string] = f;
	}

	const recommended = new Set<string>();

	for (const f of kgFiles) {
		const tier = f.tier as string;
		if (tier === "L0" || tier === "L1") {
			recommended.add(f.id as string);
		}
	}

	if (taskType) {
		const edges = (kg.edges as Array<Record<string, unknown>>) || [];
		for (const edge of edges) {
			if (
				edge.from === taskType &&
				edge.type === "REQUIRES" &&
				(edge.mandatory || ((edge.weight as number) || 0) > 0.5)
			) {
				recommended.add(edge.to as string);
			}
		}
	}

	const loadedFiles = (session.loaded_files as string[]) || [];
	const loaded = new Set(loadedFiles);

	const skipped = [...recommended].filter((f) => !loaded.has(f));
	const skipEvents: Array<Record<string, unknown>> = [];
	const currentRound = (session.current_round as number) || 0;
	const fileRegistry =
		(session.file_registry as Record<string, Record<string, unknown>>) || {};

	for (const fileId of skipped) {
		const fileNode = fileNodes[fileId] || {};
		const registryEntry = fileRegistry[fileId] || {};

		const lastRound = (registryEntry.last_loaded_round as number) || 0;
		const roundsSince = lastRound ? currentRound - lastRound : 0;
		const skipReason =
			lastRound && roundsSince <= 2 ? "round_dedup" : "not_relevant";

		skipEvents.push({
			timestamp: new Date().toISOString(),
			event_type: "SKIP",
			file: fileId,
			skill: (kg.project as string) || "unknown",
			tokens: fileNode.token_count || 0,
			tier: fileNode.tier || "L2",
			skip_reason: skipReason,
			last_loaded_round: lastRound,
			rounds_since: roundsSince,
		});
	}

	return skipEvents;
}

function loadReportReadEvents(): Array<Record<string, unknown>> {
	const events = loadTelemetryLog();
	const readEvents = events.filter((e) => e.event_type === "READ");
	if (readEvents.length > 0) return readEvents;

	const readsPath = join(".crp", "telemetry", "reads.jsonl");
	if (!existsSync(readsPath)) return [];

	try {
		const content = readFileSync(readsPath, "utf-8").trim();
		if (!content) return [];

		return content
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.flatMap((line) => {
				try {
					const rec = JSON.parse(line) as Record<string, unknown>;
					return [{ ...rec, event_type: "READ" }];
				} catch {
					return [];
				}
			});
	} catch {
		return [];
	}
}

export interface ReportSummary {
	windowDays: number;
	bySkill: Array<{ name: string; reads: number; tokens: number }>;
	totalReads: number;
	// Parity fields with runReport's human output:
	totalTokens: number;
	topFiles: Array<{ file: string; loads: number }>;
	skipEvents: {
		total: number;
		roundDedup: number;
		notRelevant: number;
	} | null;
}

export function buildReportSummary(
	taskType?: string | null,
): ReportSummary | null {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) return null;
	const windowDays = manifest.crp?.telemetry?.window_days ?? 30;
	const readEvents = loadReportReadEvents();

	const bySkillMap = new Map<string, { reads: number; tokens: number }>();
	for (const e of readEvents) {
		const skill = (e.skill as string) || "unknown";
		const tokens = (e.tokens as number) || 0;
		const entry = bySkillMap.get(skill) || { reads: 0, tokens: 0 };
		entry.reads += 1;
		entry.tokens += tokens;
		bySkillMap.set(skill, entry);
	}

	const bySkill = [...bySkillMap.entries()]
		.map(([name, v]) => ({ name, reads: v.reads, tokens: v.tokens }))
		.sort((a, b) => b.reads - a.reads);

	// Mirror runReport: sum of loaded tokens across all READ events.
	const totalTokens = readEvents.reduce(
		(sum, e) => sum + ((e.tokens as number) || 0),
		0,
	);

	// Mirror runReport: top files by load count, bounded to 10.
	const fileCounts: Record<string, number> = {};
	for (const e of readEvents) {
		const f = (e.file as string) || "unknown";
		fileCounts[f] = (fileCounts[f] || 0) + 1;
	}
	const topFiles = Object.entries(fileCounts)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10)
		.map(([file, loads]) => ({ file, loads }));

	// Mirror runReport: derived SKIP events when KG + session state exist.
	let skipEvents: ReportSummary["skipEvents"] = null;
	const kgPath = join(".crp", "kg", ".crp-kg.json");
	const sessionPath = join(".crp", "session", "state.json");
	if (existsSync(kgPath) && existsSync(sessionPath)) {
		const events = deriveSkipEvents(kgPath, sessionPath, taskType);
		if (events.length > 0) {
			const roundDedup = events.filter(
				(e) => e.skip_reason === "round_dedup",
			).length;
			skipEvents = {
				total: events.length,
				roundDedup,
				notRelevant: events.length - roundDedup,
			};
		}
	}

	return {
		windowDays,
		bySkill,
		totalReads: readEvents.length,
		totalTokens,
		topFiles,
		skipEvents,
	};
}

export function runReport(skillName?: string | null): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		console.log("ERROR: No crp.yaml found");
		return 1;
	}

	const readEvents = loadReportReadEvents();

	console.log("\n== CRP Telemetry Report ==\n");

	if (readEvents.length === 0) {
		console.log("No telemetry events recorded");
		console.log("\nRun 'crp telemetry start' to begin recording");
		return 0;
	}

	const totalTokens = readEvents.reduce(
		(sum, e) => sum + ((e.tokens as number) || 0),
		0,
	);

	console.log(`Total READ events: ${readEvents.length}`);
	console.log(`Total tokens loaded: ${totalTokens.toLocaleString()}`);

	const fileCounts: Record<string, number> = {};
	for (const e of readEvents) {
		const f = (e.file as string) || "unknown";
		fileCounts[f] = (fileCounts[f] || 0) + 1;
	}

	console.log("\nTop files by load count:");
	const sorted = Object.entries(fileCounts)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10);
	for (const [f, count] of sorted) {
		console.log(`  ${f}: ${count} loads`);
	}

	const kgPath = join(".crp", "kg", ".crp-kg.json");
	const sessionPath = join(".crp", "session", "state.json");
	if (existsSync(kgPath) && existsSync(sessionPath)) {
		const skipEvents = deriveSkipEvents(kgPath, sessionPath, skillName);
		if (skipEvents.length > 0) {
			console.log(`\nDerived SKIP events: ${skipEvents.length}`);
			const deduped = skipEvents.filter(
				(e) => e.skip_reason === "round_dedup",
			).length;
			console.log(`  Round dedup: ${deduped}`);
			console.log(`  Not relevant: ${skipEvents.length - deduped}`);
		}
	}

	return 0;
}
