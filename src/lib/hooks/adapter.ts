import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSettings, saveSettings } from "../fs/settings";

export interface HookStatus {
	postReadActive: boolean;
	sessionStartActive: boolean;
}

export interface HookAdapter {
	/** Adapter identifier */
	readonly name: string;

	/** Absolute path to the platform's settings file */
	settingsPath(projectDir: string): string;

	/** Install CRP hooks into the platform */
	install(projectDir: string): void;

	/** Remove CRP hooks from the platform */
	remove(projectDir: string): void;

	/** Check whether CRP hooks are currently active */
	checkStatus(projectDir: string): HookStatus;
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
			(h) => typeof h.command === "string" && h.command.includes("post-read"),
		);
	}
	// Legacy format: flat command field
	if (
		typeof hooks.command === "string" &&
		hooks.command.includes("post-read")
	) {
		return true;
	}
	return false;
}

// ─── Claude Settings Adapter (parameterized by settings filename) ───
//
// Claude Code CLI and Claude Desktop accept the SAME nested hook format
// (`{ matcher, hooks: [{ type, command }] }`); the only variable is which
// settings file the user's installation uses. That's a parameter, not a
// type — so one class covers both. The HookAdapter interface stays as the
// seam for a future second target that writes a different format.

export class ClaudeSettingsAdapter implements HookAdapter {
	constructor(
		readonly name: string,
		private readonly settingsFileName: "settings.local.json" | "settings.json",
	) {}

	settingsPath(projectDir: string): string {
		return join(projectDir, ".claude", this.settingsFileName);
	}

	install(projectDir: string): void {
		const settingsPath = this.settingsPath(projectDir);
		const settings = loadSettings(settingsPath);

		if (!settings.hooks) {
			settings.hooks = {};
		}
		const hooks = settings.hooks as Record<string, unknown>;

		// PostToolUse hook for Read tool (telemetry)
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

	remove(projectDir: string): void {
		const settingsPath = this.settingsPath(projectDir);
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
			const filtered = postToolUse.filter((h) => !hasPostRead(h));
			if (filtered.length === 0) {
				delete hooks.PostToolUse;
			} else {
				hooks.PostToolUse = filtered;
			}
		}

		// Remove SessionStart hook (legacy cleanup)
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

	checkStatus(projectDir: string): HookStatus {
		let postReadActive = false;
		let sessionStartActive = false;
		const settingsPath = this.settingsPath(projectDir);

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
}

// ─── Factory ───

/** Return the default hook adapter for the current environment. */
export function getDefaultAdapter(): HookAdapter {
	const projectDir = process.cwd();
	return detectAdapter(projectDir) ?? claudeCodeAdapter();
}

/** Detect which adapter is active for the given project directory. */
export function detectAdapter(projectDir: string): HookAdapter | null {
	const adapters: HookAdapter[] = [claudeCodeAdapter(), claudeDesktopAdapter()];
	for (const adapter of adapters) {
		if (existsSync(adapter.settingsPath(projectDir))) {
			return adapter;
		}
	}
	return null;
}

function claudeCodeAdapter(): ClaudeSettingsAdapter {
	return new ClaudeSettingsAdapter("claude-code", "settings.local.json");
}

function claudeDesktopAdapter(): ClaudeSettingsAdapter {
	return new ClaudeSettingsAdapter("claude-desktop", "settings.json");
}
