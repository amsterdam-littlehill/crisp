import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { green, red, yellow } from "../lib/cli/colors";
import { printError, printOk, printWarn } from "../lib/cli/format";
import { checkHookStatus } from "../lib/crp/hooks/inject";
import { getSkillSourceDirs } from "../lib/crp/skill-source";
import { loadManifest } from "../lib/manifest/io";

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

export function cmdStatus(): number {
	const projectDir = process.cwd();
	const manifestPath = join(projectDir, "crp.yaml");
	const crpDir = join(projectDir, ".crp");
	const routesPath = join(crpDir, "routes.json");
	const telemetryPath = join(crpDir, "telemetry", "reads.jsonl");
	const settingsPath = join(projectDir, ".claude", "settings.json");

	console.log("== CRP Status ==\n");

	// Project name from manifest
	const manifest = loadManifest(manifestPath);
	const projectName = manifest.project?.name || "(unknown)";
	console.log(`Project: ${projectName}`);

	// Manifest status
	if (existsSync(manifestPath)) {
		try {
			loadManifest(manifestPath);
			printOk(`Manifest: crp.yaml (exists, valid)`);
		} catch {
			printWarn(`Manifest: crp.yaml (exists, invalid)`);
		}
	} else {
		printError(`Manifest: crp.yaml (not found)`);
	}

	// Routes status
	if (existsSync(routesPath)) {
		const lastSync = getLastSyncTime(routesPath);
		if (lastSync) {
			printOk(`Routes: .crp/routes.json (last sync: ${lastSync})`);
		} else {
			printOk(`Routes: .crp/routes.json (exists)`);
		}
	} else {
		printWarn(`Routes: .crp/routes.json (not found)`);
	}

	// Telemetry status
	if (existsSync(telemetryPath)) {
		const stats = statSync(telemetryPath);
		const size = formatBytes(stats.size);
		const age = getFileAgeDays(telemetryPath);
		const ageStr = age !== null ? `${age} days` : "unknown age";
		printOk(`Telemetry: .crp/telemetry/reads.jsonl (${size}, ${ageStr})`);
	} else {
		printWarn(`Telemetry: .crp/telemetry/reads.jsonl (not found)`);
	}

	// Hooks status
	const hookStatus = checkHookStatus(settingsPath);
	const postReadIcon = hookStatus.postReadActive ? green("✓") : red("✗");
	const sessionStartIcon = hookStatus.sessionStartActive
		? green("✓")
		: red("✗");
	console.log(
		`Hooks: PostToolUse ${postReadIcon}, SessionStart ${sessionStartIcon}`,
	);

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
	console.log(
		`Skills: ${totalSkills} registered, ${projectSkills} project-level, ${userSkills} user-level`,
	);

	// Token budget
	let totalTokens = 0;
	const maxTokens = manifest.crp?.session_inject?.max_tokens ?? 300;
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
	const budgetColor =
		percentage >= 90 ? red : percentage >= 70 ? yellow : green;
	console.log(
		`Token Budget: ${totalTokens} / ${maxTokens} tokens (${budgetColor(`${percentage}%`)})`,
	);

	console.log();
	return 0;
}
