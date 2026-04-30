import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSettings, saveSettings } from "../../fs/settings";

export interface HookStatus {
	postReadActive: boolean;
	sessionStartActive: boolean;
}

function getHookCommand(projectDir: string, scriptName: string): string {
	const scriptPath = join(projectDir, ".crp", "hooks", scriptName);
	return `node "${scriptPath}"`;
}

function hasPostRead(hooks: Record<string, unknown>): boolean {
	// New format: nested hooks array
	const arr = hooks.hooks as Array<Record<string, unknown>> | undefined;
	if (arr) {
		return arr.some(
			(h) =>
				typeof h.command === "string" && h.command.includes("post-read"),
		);
	}
	// Legacy format: flat command field
	if (typeof hooks.command === "string" && hooks.command.includes("post-read")) {
		return true;
	}
	return false;
}

export function installHooks(projectDir: string, settingsPath: string): void {
	const settings = loadSettings(settingsPath);
	if (!settings.hooks) {
		settings.hooks = {};
	}
	const hooks = settings.hooks as Record<string, unknown>;

	// PostToolUse hook for Read tool
	if (!hooks.PostToolUse) {
		hooks.PostToolUse = [];
	}
	const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;

	const postReadCmd = getHookCommand(projectDir, "post-read.mjs");
	// Clean up any legacy or duplicate post-read hooks, then add one canonical entry
	const cleaned = postToolUse.filter(
		(h) => !(h.matcher === "Read" && hasPostRead(h)),
	);
	cleaned.push({
		matcher: "Read",
		hooks: [{ type: "command", command: postReadCmd }],
	});
	hooks.PostToolUse = cleaned;

	// Remove legacy SessionStart hook if present (migrated to CLAUDE.md)
	if (hooks.SessionStart) {
		const sessionStart = hooks.SessionStart as Array<Record<string, unknown>>;
		const filtered = sessionStart.filter(
			(h) =>
				!(
					typeof h.command === "string" && h.command.includes("session-start")
				),
		);
		if (filtered.length === 0) {
			delete hooks.SessionStart;
		} else {
			hooks.SessionStart = filtered;
		}
	}

	if (Object.keys(hooks).length === 0) {
		delete settings.hooks;
	}

	saveSettings(settingsPath, settings);
}

export function removeHooks(settingsPath: string): void {
	if (!existsSync(settingsPath)) {
		return;
	}

	const settings = loadSettings(settingsPath);
	const hooks = settings.hooks as Record<string, unknown> | undefined;
	if (!hooks) {
		return;
	}

	// Remove PostToolUse hook
	if (hooks.PostToolUse) {
		const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;
		const filtered = postToolUse.filter(
			(h) =>
				!hasPostRead(h),
		);
		if (filtered.length === 0) {
			delete hooks.PostToolUse;
		} else {
			hooks.PostToolUse = filtered;
		}
	}

	// Remove SessionStart hook
	if (hooks.SessionStart) {
		const sessionStart = hooks.SessionStart as Array<Record<string, unknown>>;
		const filtered = sessionStart.filter(
			(h) =>
				!(
					typeof h.command === "string" && h.command.includes("session-start")
				),
		);
		if (filtered.length === 0) {
			delete hooks.SessionStart;
		} else {
			hooks.SessionStart = filtered;
		}
	}

	if (Object.keys(hooks).length === 0) {
		delete settings.hooks;
	}

	saveSettings(settingsPath, settings);
}

export function checkHookStatus(settingsPath: string): HookStatus {
	let postReadActive = false;
	let sessionStartActive = false;

	if (existsSync(settingsPath)) {
		try {
			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			const postHooks = (settings.hooks as Record<string, unknown>)
				?.PostToolUse as Array<Record<string, unknown>>;
			if (postHooks) {
				postReadActive = postHooks.some((h) => hasPostRead(h));
			}
			const startHooks = (settings.hooks as Record<string, unknown>)
				?.SessionStart as Array<Record<string, unknown>>;
			if (startHooks) {
				sessionStartActive = startHooks.some(
					(h) =>
						typeof h.command === "string" &&
						h.command.includes("session-start"),
				);
			}
		} catch {
			// ignore
		}
	}

	return { postReadActive, sessionStartActive };
}
