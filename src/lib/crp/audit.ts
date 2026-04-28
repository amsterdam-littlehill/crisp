import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeReads } from "./analyzer";
import type { Routes } from "./injection";

export interface AuditResult {
	inlineCount: number;
	lazyCount: number;
	deadCount: number;
	totalTokens: number;
	maxTokens: number;
	tokenUsage: number;
	deadCandidates: string[];
}

export function runCrpAudit(projectDir: string = process.cwd()): AuditResult {
	const crpDir = join(projectDir, ".crp");
	const readsPath = join(crpDir, "telemetry", "reads.jsonl");
	const routesPath = join(crpDir, "routes.json");

	// Load routes
	let routes: Routes | null = null;
	try {
		routes = JSON.parse(readFileSync(routesPath, "utf-8")) as Routes;
	} catch {
		// no routes
	}

	// Analyze recent reads (14 days for dead candidate detection)
	const recentFrequencies = analyzeReads(readsPath, 14);
	const recentSkillNames = new Set(recentFrequencies.map((f) => f.name));

	// Analyze full window (30 days) for histogram
	const allFrequencies = analyzeReads(readsPath, 30);

	const inlineCount =
		routes?.skills.filter((s) => s.strategy === "inline").length ?? 0;
	const lazyCount =
		routes?.skills.filter((s) => s.strategy === "lazy").length ?? 0;
	const deadCount =
		routes?.skills.filter((s) => s.strategy === "dead").length ?? 0;
	const totalTokens = routes?.l0_inject_tokens ?? 0;
	const maxTokens = 300;

	// Find dead candidates: skills in routes with 0 reads in last 14 days
	const deadCandidates: string[] = [];
	if (routes) {
		for (const skill of routes.skills) {
			if (!recentSkillNames.has(skill.name)) {
				deadCandidates.push(skill.name);
			}
		}
	}

	// Print report
	console.log("== CRP Audit ==");
	console.log("");
	console.log(
		`L0 Injection: ${totalTokens} / ${maxTokens} tokens (${((totalTokens / maxTokens) * 100).toFixed(1)}%)`,
	);
	console.log("");
	console.log("Tier distribution:");
	console.log(`  Inline: ${inlineCount}`);
	console.log(`  Lazy:   ${lazyCount}`);
	console.log(`  Dead:   ${deadCount}`);
	console.log("");

	if (allFrequencies.length > 0) {
		console.log("Frequency histogram (30 days):");
		for (const freq of allFrequencies) {
			const bar = "█".repeat(Math.round(freq.freq * 20));
			console.log(
				`  ${freq.name.padEnd(20)} ${bar} ${(freq.freq * 100).toFixed(0)}%`,
			);
		}
		console.log("");
	}

	if (deadCandidates.length > 0) {
		console.log("Dead candidates (0 reads in 14 days):");
		for (const name of deadCandidates) {
			console.log(`  - ${name}`);
		}
		console.log("");
	}

	return {
		inlineCount,
		lazyCount,
		deadCount,
		totalTokens,
		maxTokens,
		tokenUsage: totalTokens / maxTokens,
		deadCandidates,
	};
}
