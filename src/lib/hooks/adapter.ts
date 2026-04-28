/**
 * hooks/adapter.ts — Hook platform adapter interface.
 *
 * Provides an abstraction over AI platform hook mechanisms.
 * Currently implements Claude Desktop (.claude/settings.json).
 * Future platforms (Cursor, VS Code, etc.) can implement HookAdapter.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

// ─── Internal helpers (copied from crp/hooks/inject.ts to avoid circular deps) ───

function loadSettings(settingsPath: string): Record<string, unknown> {
	if (existsSync(settingsPath)) {
		try {
			return JSON.parse(readFileSync(settingsPath, "utf-8"));
		} catch {
			return {};
		}
	}
	mkdirSync(dirname(settingsPath), { recursive: true });
	return {};
}

function saveSettings(
	settingsPath: string,
	settings: Record<string, unknown>,
): void {
	writeFileSync(
		settingsPath,
		`${JSON.stringify(settings, null, 2)}\n`,
		"utf-8",
	);
}

function getHookCommand(projectDir: string, scriptName: string): string {
	const scriptPath = join(projectDir, ".crp", "hooks", scriptName);
	return `bun run "${scriptPath}"`;
}

// ─── Claude Desktop Adapter ───

export class ClaudeDesktopAdapter implements HookAdapter {
	readonly name = "claude-desktop";

	settingsPath(projectDir: string): string {
		return join(projectDir, ".claude", "settings.json");
	}

	install(projectDir: string): void {
		const settingsPath = this.settingsPath(projectDir);
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

		const postReadCmd = getHookCommand(projectDir, "post-read.ts");
		const existingPostRead = postToolUse.find(
			(h) => typeof h.command === "string" && h.command.includes("post-read"),
		);
		if (!existingPostRead) {
			postToolUse.push({
				matcher: "Read",
				command: postReadCmd,
			});
		}

		// SessionStart hook
		if (!hooks.SessionStart) {
			hooks.SessionStart = [];
		}
		const sessionStart = hooks.SessionStart as Array<Record<string, unknown>>;

		const sessionStartCmd = getHookCommand(projectDir, "session-start.ts");
		const existingSessionStart = sessionStart.find(
			(h) =>
				typeof h.command === "string" && h.command.includes("session-start"),
		);
		if (!existingSessionStart) {
			sessionStart.push({
				command: sessionStartCmd,
			});
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
			const filtered = postToolUse.filter(
				(h) =>
					!(typeof h.command === "string" && h.command.includes("post-read")),
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
					postReadActive = postHooks.some(
						(h) =>
							typeof h.command === "string" && h.command.includes("post-read"),
					);
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

const DEFAULT_ADAPTER = new ClaudeDesktopAdapter();

/** Return the default hook adapter for the current environment. */
export function getDefaultAdapter(): HookAdapter {
	return DEFAULT_ADAPTER;
}

/** Detect which adapter is active for the given project directory. */
export function detectAdapter(projectDir: string): HookAdapter | null {
	const adapters: HookAdapter[] = [new ClaudeDesktopAdapter()];
	for (const adapter of adapters) {
		if (existsSync(adapter.settingsPath(projectDir))) {
			return adapter;
		}
	}
	return null;
}
