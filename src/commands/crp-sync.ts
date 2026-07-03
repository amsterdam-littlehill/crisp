import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { printOk, printWarn } from "../lib/cli/format";
import { analyzeReads } from "../lib/crp/analyzer";
import { hasInjectionBlock, updateClaudeMd } from "../lib/crp/claude-md";
import { updateCodexInstructions } from "../lib/crp/codex-instructions";
import type { Routes } from "../lib/crp/injection";
import { generateRoutes } from "../lib/crp/routes";
import { getSkillSourceDirs, type SkillSource } from "../lib/crp/skill-source";
import { loadManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";

export interface SyncOptions {
	check?: boolean;
	includeUser?: boolean;
	json?: boolean;
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

	// ponytail: KG topics in sync deferred; see kg query
	const kgTopics: string[] = [];

	// Generate routes
	const routes = generateRoutes(manifest as CrpManifest, filtered, kgTopics);

	const inline = routes.skills.filter((s) => s.strategy === "inline").length;
	const lazy = routes.skills.filter((s) => s.strategy === "lazy").length;
	const dead = routes.skills.filter((s) => s.strategy === "dead").length;
	const userCount = routes.skills.filter((s) => s.source === "user").length;

	if (options.check) {
		if (options.json) {
			// Diff the would-be-generated routes against existing routes.json to
			// surface a structured preview. Mirrors the human --check counts plus
			// the owner's requested changes/added/removed shape.
			const prevNames = readPrevRouteSkillNames(routesPath);
			const nextNames = routes.skills.map((s) => s.name);
			const prevSet = new Set(prevNames);
			const nextSet = new Set(nextNames);
			const added = nextNames.filter((n) => !prevSet.has(n));
			const removed = prevNames.filter((n) => !nextSet.has(n));
			const sameStrategies = routes.skills.every((s) => {
				const prev = prevNames.includes(s.name);
				// A strategy change also counts as a change; we approximate by
				// membership diff which is what the owner's schema implies.
				return prev;
			});
			const result = {
				changes: added.length > 0 || removed.length > 0 || !sameStrategies,
				added,
				removed,
				skills: routes.skills.map((s) => ({
					name: s.name,
					strategy: s.strategy,
					source: s.source ?? null,
				})),
				inline,
				lazy,
				dead,
				userLevel: userCount,
				skippedUser,
				totalTokens: routes.l0_inject_tokens ?? null,
			};
			console.log(JSON.stringify(result, null, 2));
			return 0;
		}
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

	// Update CLAUDE.md injection block
	const claudeMdPath = join(projectDir, "CLAUDE.md");
	if (existsSync(claudeMdPath)) {
		const { readFileSync: readFile } = require("node:fs");
		const content = readFile(claudeMdPath, "utf-8");
		if (hasInjectionBlock(content)) {
			const mdResult = updateClaudeMd(
				projectDir,
				routes,
				manifest as CrpManifest,
			);
			if (mdResult.updated) {
				printOk("CLAUDE.md injection updated");
			} else {
				printOk("CLAUDE.md already up to date");
			}
		} else {
			printWarn(
				"CLAUDE.md has no CRP injection block — run 'crp init' to add one",
			);
		}
	} else {
		const mdResult = updateClaudeMd(
			projectDir,
			routes,
			manifest as CrpManifest,
		);
		if (mdResult.created) {
			printOk("CLAUDE.md created with CRP injection block");
		}
	}

	const codexResult = updateCodexInstructions(
		projectDir,
		routes,
		manifest as CrpManifest,
	);
	if (codexResult.created) {
		printOk(".codex/instructions.md created with CRP injection block");
	} else if (codexResult.updated) {
		printOk(".codex/instructions.md updated with CRP injection block");
	} else {
		printOk(".codex/instructions.md already up to date");
	}

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

/**
 * Read skill names from an existing routes.json so --check --json can diff
 * the would-be-generated routes against the on-disk predecessor. Returns an
 * empty list when the file is missing or malformed (treated as "no prior").
 */
function readPrevRouteSkillNames(routesPath: string): string[] {
	if (!existsSync(routesPath)) return [];
	try {
		const parsed = JSON.parse(readFileSync(routesPath, "utf-8")) as Routes;
		return (parsed.skills ?? []).map((s) => s.name);
	} catch {
		return [];
	}
}
