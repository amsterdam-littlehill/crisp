import type { SessionState } from "../session/state";
import { loadSession } from "../session/state";

export interface LoadMetrics {
	total_rounds: number;
	total_loaded: number;
	total_skipped: number;
	dedup_savings_percent: number;
	avg_files_per_round: number;
	most_loaded_file: string | null;
	last_skipped_file: string | null;
}

export interface ReflectionReport {
	session_id: string;
	skill: string;
	kg_version: string;
	pressure_level: string;
	metrics: LoadMetrics;
	recommendations: string[];
}

export function analyzeSession(session: SessionState): ReflectionReport {
	let totalLoaded = 0;
	for (const entry of Object.values(session.file_registry)) {
		totalLoaded += entry.load_count || 0;
	}
	const totalSkipped = session.skipped_files.length;

	const totalOps = totalLoaded + totalSkipped;
	const dedupSavingsPercent =
		totalOps > 0 ? (totalSkipped / totalOps) * 100 : 0;

	const avgFilesPerRound = totalLoaded / Math.max(session.current_round, 1);

	let mostLoadedFile: string | null = null;
	const registryEntries = Object.entries(session.file_registry);
	if (registryEntries.length > 0) {
		let maxCount = 0;
		for (const [file, entry] of registryEntries) {
			if ((entry.load_count || 0) > maxCount) {
				maxCount = entry.load_count || 0;
				mostLoadedFile = file;
			}
		}
	}

	const lastSkippedFile =
		session.skipped_files.length > 0 ? session.skipped_files[0] : null;

	const recommendations: string[] = [];
	if (dedupSavingsPercent < 10) {
		recommendations.push(
			"Consider increasing dedup_rounds — low skip rate suggests redundant loads",
		);
	}
	if (avgFilesPerRound > 10) {
		recommendations.push(
			"High per-round file count — consider splitting into more focused workflows",
		);
	}
	if (session.pressure_level !== "normal") {
		recommendations.push(
			`Session experienced ${session.pressure_level} pressure — review L1/L2 loading strategy`,
		);
	}
	if (totalLoaded === 0) {
		recommendations.push(
			"No files were loaded — verify skill configuration and KG connectivity",
		);
	}
	if (session.loaded_files.length === 0) {
		recommendations.push(
			"Last round loaded no files — check for routing failures",
		);
	}
	if (recommendations.length === 0) {
		recommendations.push(
			"Session completed successfully — no immediate concerns",
		);
	}

	return {
		session_id: session.session_id,
		skill: session.skill,
		kg_version: session.kg_version,
		pressure_level: session.pressure_level,
		metrics: {
			total_rounds: session.current_round,
			total_loaded: totalLoaded,
			total_skipped: totalSkipped,
			dedup_savings_percent: Math.round(dedupSavingsPercent * 10) / 10,
			avg_files_per_round: Math.round(avgFilesPerRound * 10) / 10,
			most_loaded_file: mostLoadedFile,
			last_skipped_file: lastSkippedFile,
		},
		recommendations,
	};
}

export function loadAndReflect(sessionPath: string): ReflectionReport {
	const session = loadSession(sessionPath);
	return analyzeSession(session);
}

export function formatReport(report: ReflectionReport): string {
	const lines: string[] = [
		`Session ID: ${report.session_id}`,
		`Skill: ${report.skill}`,
		report.kg_version ? `KG: ${report.kg_version}` : "KG: default",
		`Pressure Level: ${report.pressure_level}`,
		"",
		"Metrics:",
		`  Total Rounds: ${report.metrics.total_rounds}`,
		`  Total Loaded: ${report.metrics.total_loaded}`,
		`  Total Skipped: ${report.metrics.total_skipped}`,
		`  Dedup Savings: ${report.metrics.dedup_savings_percent}%`,
		`  Avg Files/Round: ${report.metrics.avg_files_per_round}`,
		`  Most Loaded File: ${report.metrics.most_loaded_file || "N/A"}`,
		`  Last Skipped File: ${report.metrics.last_skipped_file || "N/A"}`,
		"",
		"Recommendations:",
	];
	for (const rec of report.recommendations) {
		lines.push(`  - ${rec}`);
	}
	return lines.join("\n");
}
