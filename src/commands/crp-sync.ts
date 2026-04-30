import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeReads } from "../lib/crp/analyzer";
import { generateRoutes } from "../lib/crp/routes";
import { getSkillSourceDirs, type SkillSource } from "../lib/crp/skill-source";
import { loadManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";

export interface SyncOptions {
	check?: boolean;
	includeUser?: boolean;
}

function scanInstalledSkills(): Array<{ name: string; source: SkillSource }> {
	const dirs = getSkillSourceDirs();
	const found: Array<{ name: string; source: SkillSource }> = [];
	for (const dir of dirs) {
		try {
			const entries = readdirSync(dir.path, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				// Skip if same-named skill already found from a higher-priority source
				if (found.some((f) => f.name === entry.name)) continue;
				found.push({ name: entry.name, source: dir.source });
			}
		} catch {
			// directory doesn't exist
		}
	}
	return found;
}

export function cmdCrpSync(options: SyncOptions = {}): number {
	const projectDir = process.cwd();
	const crpDir = join(projectDir, ".crp");
	const readsPath = join(crpDir, "telemetry", "reads.jsonl");
	const routesPath = join(crpDir, "routes.json");
	const manifestPath = join(projectDir, "crp.yaml");

	// Load manifest for thresholds
	const manifest = loadManifest(manifestPath);
	const windowDays = manifest.crp?.telemetry?.window_days ?? 30;

	// Analyze reads
	const frequencies = analyzeReads(readsPath, windowDays);
	const freqMap = new Map(frequencies.map((f) => [f.name, f]));

	// Include installed skills that have no telemetry yet
	const installed = scanInstalledSkills();
	for (const sk of installed) {
		if (!freqMap.has(sk.name)) {
			// Skip user-level skills unless --include-user is set
			if (sk.source === "user" && !options.includeUser) continue;
			frequencies.push({
				name: sk.name,
				freq: 0,
				sessions: 0,
				totalSessions:
					frequencies.length > 0
						? Math.max(...frequencies.map((f) => f.totalSessions))
						: 0,
				source: sk.source,
			});
		} else {
			// Tag existing frequencies with source if known
			const existing = freqMap.get(sk.name);
			if (existing && !existing.source) {
				existing.source = sk.source;
			}
		}
	}

	// Filter out user-level skills unless explicitly included
	const filtered = options.includeUser
		? frequencies
		: frequencies.filter((f) => f.source !== "user");

	const skippedUser = !options.includeUser
		? frequencies.filter((f) => f.source === "user").length
		: 0;

	// TODO: Load KG topics from kg/index.json (Day 7)
	const kgTopics: string[] = [];

	// Generate routes
	const routes = generateRoutes(manifest as CrpManifest, filtered, kgTopics);

	const inline = routes.skills.filter((s) => s.strategy === "inline").length;
	const lazy = routes.skills.filter((s) => s.strategy === "lazy").length;
	const dead = routes.skills.filter((s) => s.strategy === "dead").length;
	const userCount = routes.skills.filter((s) => s.source === "user").length;

	if (options.check) {
		console.log(`[CHECK] Would generate routes with:`);
		console.log(`  Inline: ${inline}`);
		console.log(`  Lazy: ${lazy}`);
		console.log(`  Dead: ${dead}`);
		if (userCount > 0) console.log(`  User-level: ${userCount}`);
		if (skippedUser > 0) {
			console.log(
				`\n  ${skippedUser} user-level skill(s) skipped. Use --include-user to include them.`,
			);
		}
		return 0;
	}

	// Write routes.json
	writeFileSync(routesPath, `${JSON.stringify(routes, null, 2)}\n`, "utf-8");

	// Output stats
	console.log("[CRP] Sync complete.");
	console.log(`  Inline: ${inline}`);
	console.log(`  Lazy: ${lazy}`);
	console.log(`  Dead: ${dead}`);
	if (userCount > 0) console.log(`  User-level: ${userCount}`);
	console.log(`  Total tokens: ${routes.l0_inject_tokens ?? "unknown"}`);
	if (skippedUser > 0) {
		console.log(
			`\n  ${skippedUser} user-level skill(s) skipped. Use --include-user to include them.`,
		);
	}

	return 0;
}
