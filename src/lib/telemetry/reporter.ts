import { join } from "node:path";
import {
	extractSkillName,
	type ReadRecord,
	readReadEvents,
} from "../crp/analyzer";
import { loadManifest, manifestPath } from "../manifest/io";

function loadReportReadEvents(): ReadRecord[] {
	// reads.jsonl is the canonical telemetry source, written by the
	// post-read.mjs hook that crp init installs.
	return readReadEvents(join(".crp", "telemetry", "reads.jsonl"));
}

export interface ReportSummary {
	windowDays: number;
	// Reads of skill-definition files only (paths matching <name>.skill.md or
	// skills/<name>/SKILL.md — the canonical CRP skill-file naming, shared with
	// analyzer.ts/findSkillPath). Non-skill reads are excluded; totalReads
	// covers all reads. reads.jsonl carries no `skill` field, so the bucket is
	// derived from each event's `file` path.
	bySkill: Array<{ name: string; reads: number; tokens: number }>;
	totalReads: number;
	// Parity fields with runReport's human output:
	totalTokens: number;
	topFiles: Array<{ file: string; loads: number }>;
}

export function buildReportSummary(): ReportSummary | null {
	const manifest = loadManifest(manifestPath());
	if (!manifest.project) return null;
	const windowDays = manifest.crp?.telemetry?.window_days ?? 30;
	const readEvents = loadReportReadEvents();

	const bySkillMap = new Map<string, { reads: number; tokens: number }>();
	for (const e of readEvents) {
		// reads.jsonl records {ts, session_id, file, tokens} — no `skill`.
		// Derive skill from the file path via the canonical naming convention
		// (same regex as analyzer.ts/findSkillPath). Non-skill reads are
		// skipped so bySkill reflects actual skill-file reads, not "unknown".
		const skill = extractSkillName((e.file as string) || "");
		if (!skill) continue;
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

	return {
		windowDays,
		bySkill,
		totalReads: readEvents.length,
		totalTokens,
		topFiles,
	};
}

export function runReport(): number {
	const manifest = loadManifest(manifestPath());
	if (!manifest.project) {
		console.log("ERROR: No crp.yaml found");
		return 1;
	}

	const readEvents = loadReportReadEvents();

	console.log("\n== CRP Telemetry Report ==\n");

	if (readEvents.length === 0) {
		console.log("No telemetry events recorded");
		console.log("\nRun 'crp init' to install the telemetry hook");
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

	return 0;
}
