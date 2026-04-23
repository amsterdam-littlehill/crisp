import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeReads } from "../lib/crp/analyzer";
import { generateRoutes } from "../lib/crp/routes";
import { loadManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";

export interface SyncOptions {
	check?: boolean;
}

export function cmdCrpSync(options: SyncOptions = {}): number {
	const projectDir = process.cwd();
	const crpDir = join(projectDir, ".crp");
	const readsPath = join(crpDir, "telemetry", "reads.jsonl");
	const routesPath = join(crpDir, "routes.json");
	const manifestPath = join(crpDir, "crp.yaml");

	// Load manifest for thresholds
	const manifest = (loadManifest(manifestPath) || {}) as CrpManifest;
	const windowDays = manifest.crp?.telemetry?.window_days ?? 30;

	// Analyze reads
	const frequencies = analyzeReads(readsPath, windowDays);

	// TODO: Load KG topics from kg/index.json (Day 7)
	const kgTopics: string[] = [];

	// Generate routes
	const routes = generateRoutes(manifest, frequencies, kgTopics);

	const inline = routes.skills.filter((s) => s.strategy === "inline").length;
	const lazy = routes.skills.filter((s) => s.strategy === "lazy").length;
	const dead = routes.skills.filter((s) => s.strategy === "dead").length;

	if (options.check) {
		console.log(`[CHECK] Would generate routes with:`);
		console.log(`  Inline: ${inline}`);
		console.log(`  Lazy: ${lazy}`);
		console.log(`  Dead: ${dead}`);
		return 0;
	}

	// Write routes.json
	writeFileSync(routesPath, JSON.stringify(routes, null, 2) + "\n", "utf-8");

	// Output stats
	console.log("[CRP] Sync complete.");
	console.log(`  Inline: ${inline}`);
	console.log(`  Lazy: ${lazy}`);
	console.log(`  Dead: ${dead}`);
	console.log(`  Total tokens: ${routes.l0_inject_tokens ?? "unknown"}`);

	return 0;
}
