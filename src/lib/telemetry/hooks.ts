import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSettings, saveSettings } from "../fs/settings";

export function injectHook(settingsPath: string): void {
	const settings = loadSettings(settingsPath);

	if (!settings.hooks) {
		settings.hooks = {};
	}
	const hooks = settings.hooks as Record<string, unknown>;
	if (!hooks.PostToolUse) {
		hooks.PostToolUse = [];
	}
	const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;

	const hookCommand =
		"bun run .claude/hooks/telemetry-hook.ts --read " + "$" + "{file_path}";
	for (const hook of postToolUse) {
		if (
			typeof hook.command === "string" &&
			hook.command.includes("telemetry-hook")
		) {
			console.log("Hook already installed");
			return;
		}
	}

	postToolUse.push({
		tool: "Read",
		command: hookCommand,
	});

	saveSettings(settingsPath, settings);
	console.log(`Hook injected into ${settingsPath}`);

	const hookDir = join(".claude", "hooks");
	mkdirSync(hookDir, { recursive: true });

	const hookScript = join(hookDir, "telemetry-hook.ts");
	const hookContent = [
		"/**",
		" * telemetry-hook.ts — PostToolUse hook for telemetry.",
		" *",
		" * CRITICAL: This hook must never throw exceptions.",
		" * All errors are logged to .crp/telemetry/errors.log",
		" */",
		'import { appendFileSync, mkdirSync, existsSync } from "node:fs";',
		"",
		'const readIdx = process.argv.indexOf("--read");',
		"const filePath = readIdx !== -1 ? process.argv[readIdx + 1] : undefined;",
		"if (!filePath) process.exit(0);",
		"",
		'const logDir = ".crp/telemetry";',
		"if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });",
		"",
		"try {",
		"  const record = JSON.stringify({",
		"    timestamp: new Date().toISOString(),",
		'    event_type: "READ",',
		"    file: filePath,",
		'    skill: "unknown",',
		"    tokens: 0,",
		'    tier: "unknown",',
		'    load_reason: "user_request",',
		"  });",
		'  appendFileSync(logDir + "/log.jsonl", record + "\\\\n", "utf-8");',
		"} catch (e) {",
		'  const errorLog = logDir + "/errors.log";',
		"  try {",
		'    appendFileSync(errorLog, new Date().toISOString() + ": " + String(e) + "\\\\n", "utf-8");',
		"  } catch {",
		"    // Can't even log the error — silently fail",
		"  }",
		"  process.exit(0);",
		"}",
	].join("\n");
	writeFileSync(hookScript, hookContent, "utf-8");
	console.log(`Hook script created: ${hookScript}`);

	const telemetryDir = join(".crp", "telemetry");
	mkdirSync(telemetryDir, { recursive: true });
	const gitkeep = join(telemetryDir, ".gitkeep");
	if (!existsSync(gitkeep)) {
		writeFileSync(gitkeep, "", "utf-8");
	}
}

export function removeHook(settingsPath: string): void {
	if (!existsSync(settingsPath)) {
		console.log("No settings.json found");
		return;
	}

	const settings = loadSettings(settingsPath);

	const hooks = settings.hooks as Record<string, unknown> | undefined;
	if (!hooks?.PostToolUse) {
		console.log("No hooks to remove");
		return;
	}

	const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;
	const originalCount = postToolUse.length;
	settings.hooks = {
		...hooks,
		PostToolUse: postToolUse.filter(
			(h) =>
				!(
					typeof h.command === "string" && h.command.includes("telemetry-hook")
				),
		),
	};

	const updatedHooks = (settings.hooks as Record<string, unknown>)
		.PostToolUse as Array<unknown>;
	if (!updatedHooks || updatedHooks.length === 0) {
		delete (settings.hooks as Record<string, unknown>).PostToolUse;
	}
	if (Object.keys(settings.hooks as Record<string, unknown>).length === 0) {
		delete settings.hooks;
	}

	if (
		((settings.hooks as Record<string, unknown>)?.PostToolUse as Array<unknown>)
			?.length ??
		0 < originalCount
	) {
		saveSettings(settingsPath, settings);
		console.log("Hook removed");
	} else {
		console.log("No telemetry hook found");
	}
}

export function checkHookStatus(settingsPath: string): {
	active: boolean;
	eventCount: number;
} {
	let active = false;

	if (existsSync(settingsPath)) {
		try {
			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			const postHooks = (settings.hooks as Record<string, unknown>)
				?.PostToolUse as Array<Record<string, unknown>>;
			if (postHooks) {
				active = postHooks.some(
					(h) =>
						typeof h.command === "string" &&
						h.command.includes("telemetry-hook"),
				);
			}
		} catch {
			// ignore
		}
	}

	let eventCount = 0;
	const logPath = join(".crp", "telemetry", "log.jsonl");
	if (existsSync(logPath)) {
		try {
			const content = readFileSync(logPath, "utf-8").trim();
			if (content) {
				eventCount = content.split("\n").filter(Boolean).length;
			}
		} catch {
			// ignore
		}
	}

	return { active, eventCount };
}
