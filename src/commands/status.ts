import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { green, red, yellow } from "../lib/cli/colors";
import { emitJson, printError, printOk, printWarn } from "../lib/cli/format";
import { hasInjectionBlock, readClaudeMd } from "../lib/crp/claude-md";
import { getSkillSourceDirs } from "../lib/crp/skill-source";
import { getDefaultAdapter } from "../lib/hooks/adapter";
import {
	DEFAULT_SESSION_INJECT_TOKENS,
	loadManifest,
	manifestPath,
} from "../lib/manifest/io";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function getFileAgeDays(path: string): number | null {
	try {
		const stats = statSync(path);
		const now = new Date();
		const diff = now.getTime() - stats.mtime.getTime();
		return Math.floor(diff / (1000 * 60 * 60 * 24));
	} catch {
		return null;
	}
}

function getLastSyncTime(path: string): string | null {
	try {
		const stats = statSync(path);
		return stats.mtime.toISOString().slice(0, 16).replace("T", " ");
	} catch {
		return null;
	}
}

export function cmdStatus(options: { json?: boolean } = {}): number {
	const projectDir = process.cwd();
	const manifestFile = manifestPath(projectDir);
	const crpDir = join(projectDir, ".crp");
	const routesPath = join(crpDir, "routes.json");
	const telemetryPath = join(crpDir, "telemetry", "reads.jsonl");

	// Project name from manifest (loadManifest returns {} when missing)
	const manifest = loadManifest(manifestFile);
	const projectName = manifest.project?.name || "(unknown)";

	// Manifest status
	const manifestExists = existsSync(manifestFile);
	let manifestValid = false;
	if (manifestExists) {
		try {
			loadManifest(manifestFile);
			manifestValid = true;
		} catch {
			manifestValid = false;
		}
	}

	// Routes status
	const routesExists = existsSync(routesPath);
	const lastSync = routesExists ? getLastSyncTime(routesPath) : null;

	// Telemetry status
	const telemetryExists = existsSync(telemetryPath);
	let telemetrySize: string | null = null;
	let telemetryAge: number | null = null;
	if (telemetryExists) {
		const stats = statSync(telemetryPath);
		telemetrySize = formatBytes(stats.size);
		telemetryAge = getFileAgeDays(telemetryPath);
	}

	// Hooks status
	const adapter = getDefaultAdapter();
	const hookStatus = adapter.checkStatus(projectDir);

	// CLAUDE.md status
	const claudeMdContent = readClaudeMd(projectDir);
	const claudeMdExists = claudeMdContent !== null;
	const claudeMdHasInjection =
		claudeMdContent !== null && hasInjectionBlock(claudeMdContent);

	// Skills count
	const skillDirs = getSkillSourceDirs();
	let projectSkills = 0;
	let userSkills = 0;
	for (const dir of skillDirs) {
		try {
			const entries = readdirSync(dir.path, { withFileTypes: true });
			const count = entries.filter((e) => e.isDirectory()).length;
			if (dir.source === "project") {
				projectSkills = count;
			} else {
				userSkills += count;
			}
		} catch {
			// directory doesn't exist
		}
	}
	const totalSkills = projectSkills + userSkills;

	// Token budget
	let totalTokens = 0;
	const maxTokens =
		manifest.crp?.session_inject?.max_tokens ?? DEFAULT_SESSION_INJECT_TOKENS;
	if (existsSync(routesPath)) {
		try {
			const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
			totalTokens = routes.l0_inject_tokens ?? 0;
		} catch {
			// ignore
		}
	}
	const percentage =
		maxTokens > 0 ? Math.round((totalTokens / maxTokens) * 100) : 0;

	// Structured result (computed once, used for both branches)
	const result = {
		project: projectName,
		manifest: { exists: manifestExists, valid: manifestValid },
		routes: { exists: routesExists, lastSync },
		telemetry: {
			exists: telemetryExists,
			size: telemetrySize,
			ageDays: telemetryAge,
		},
		hooks: { postReadActive: hookStatus.postReadActive, adapter: adapter.name },
		claudeMd: { exists: claudeMdExists, hasInjection: claudeMdHasInjection },
		skills: { total: totalSkills, project: projectSkills, user: userSkills },
		tokenBudget: { used: totalTokens, max: maxTokens, percent: percentage },
	};

	if (options.json) {
		emitJson(result);
		return 0;
	}

	console.log("== CRP Status ==\n");
	console.log(`Project: ${projectName}`);

	// Manifest status
	if (manifestExists) {
		if (manifestValid) {
			printOk(`Manifest: crp.yaml (exists, valid)`);
		} else {
			printWarn(`Manifest: crp.yaml (exists, invalid)`);
		}
	} else {
		printError(`Manifest: crp.yaml (not found)`);
	}

	// Routes status
	if (routesExists) {
		if (lastSync) {
			printOk(`Routes: .crp/routes.json (last sync: ${lastSync})`);
		} else {
			printOk(`Routes: .crp/routes.json (exists)`);
		}
	} else {
		printWarn(`Routes: .crp/routes.json (not found)`);
	}

	// Telemetry status
	if (telemetryExists) {
		const ageStr =
			telemetryAge !== null ? `${telemetryAge} days` : "unknown age";
		printOk(
			`Telemetry: .crp/telemetry/reads.jsonl (${telemetrySize}, ${ageStr})`,
		);
	} else {
		printWarn(`Telemetry: .crp/telemetry/reads.jsonl (not found)`);
	}

	// Hooks status
	const postReadIcon = hookStatus.postReadActive ? green("✓") : red("✗");
	console.log(`Hooks: PostToolUse ${postReadIcon} (${adapter.name})`);

	// CLAUDE.md status
	if (!claudeMdExists) {
		printWarn("CLAUDE.md: not found");
	} else if (claudeMdHasInjection) {
		printOk("CLAUDE.md: CRP injection block present");
	} else {
		printWarn("CLAUDE.md: exists but no CRP injection block");
	}

	// Skills count
	console.log(
		`Skills: ${totalSkills} registered, ${projectSkills} project-level, ${userSkills} user-level`,
	);

	// Token budget
	const budgetColor =
		percentage >= 90 ? red : percentage >= 70 ? yellow : green;
	console.log(
		`Token Budget: ${totalTokens} / ${maxTokens} tokens (${budgetColor(`${percentage}%`)})`,
	);

	console.log();
	return 0;
}
