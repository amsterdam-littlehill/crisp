import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "../manifest/io";
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
	histogram: { name: string; freq: number }[];
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

	// Load maxTokens from manifest, fallback to 300
	const manifest = loadManifest(join(projectDir, "crp.yaml"));
	const maxTokens = manifest.crp?.session_inject?.max_tokens ?? 300;

	// Find dead candidates: skills in routes with 0 reads in last 14 days
	const deadCandidates: string[] = [];
	if (routes) {
		for (const skill of routes.skills) {
			if (!recentSkillNames.has(skill.name)) {
				deadCandidates.push(skill.name);
			}
		}
	}

	return {
		inlineCount,
		lazyCount,
		deadCount,
		totalTokens,
		maxTokens,
		tokenUsage: totalTokens / maxTokens,
		deadCandidates,
		histogram: allFrequencies.map((f) => ({ name: f.name, freq: f.freq })),
	};
}
