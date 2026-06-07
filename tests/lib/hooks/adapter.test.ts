import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ClaudeCodeAdapter,
	ClaudeDesktopAdapter,
	detectAdapter,
	getDefaultAdapter,
} from "../../../src/lib/hooks/adapter";

describe("ClaudeCodeAdapter", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `crp-adapter-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("settingsPath returns .claude/settings.local.json", () => {
		const adapter = new ClaudeCodeAdapter();
		expect(adapter.settingsPath(tempDir)).toBe(
			join(tempDir, ".claude", "settings.local.json"),
		);
	});

	test("install creates settings.local.json with PostToolUse hook", () => {
		const adapter = new ClaudeCodeAdapter();
		adapter.install(tempDir);

		const settingsPath = adapter.settingsPath(tempDir);
		expect(existsSync(settingsPath)).toBe(true);

		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const hooks = settings.hooks as Record<string, unknown>;
		expect(hooks).toBeDefined();
		expect(Array.isArray(hooks.PostToolUse)).toBe(true);

		const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;
		expect(postToolUse.length).toBeGreaterThan(0);
		expect(postToolUse[0].matcher).toBe("Read");
		const innerHooks = postToolUse[0].hooks as Array<Record<string, unknown>>;
		expect(innerHooks.length).toBeGreaterThan(0);
		expect((innerHooks[0].command as string).includes("post-read")).toBe(true);
	});

	test("install does not add SessionStart hook", () => {
		const adapter = new ClaudeCodeAdapter();
		adapter.install(tempDir);

		const settingsPath = adapter.settingsPath(tempDir);
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(settings.hooks?.SessionStart).toBeUndefined();
	});

	test("install removes legacy SessionStart hook", () => {
		const adapter = new ClaudeCodeAdapter();
		const settingsPath = adapter.settingsPath(tempDir);
		const claudeDir = join(tempDir, ".claude");
		mkdirSync(claudeDir, { recursive: true });

		// Pre-populate with a legacy SessionStart hook
		const existingSettings = {
			hooks: {
				SessionStart: [{ command: 'bun run ".crp/hooks/session-start.ts"' }],
			},
		};
		writeFileSync(
			settingsPath,
			JSON.stringify(existingSettings, null, 2),
			"utf-8",
		);

		adapter.install(tempDir);

		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(settings.hooks?.SessionStart).toBeUndefined();
		expect(settings.hooks?.PostToolUse).toBeDefined();
	});

	test("install is idempotent", () => {
		const adapter = new ClaudeCodeAdapter();
		adapter.install(tempDir);
		adapter.install(tempDir);

		const settingsPath = adapter.settingsPath(tempDir);
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const postToolUse = (settings.hooks as Record<string, unknown>)
			.PostToolUse as Array<Record<string, unknown>>;
		const postReadHooks = postToolUse.filter((h) =>
			(h.hooks as Array<Record<string, unknown>>)?.some(
				(ih) =>
					typeof ih.command === "string" && ih.command.includes("post-read"),
			),
		);
		expect(postReadHooks.length).toBe(1);
	});

	test("remove cleans up hooks", () => {
		const adapter = new ClaudeCodeAdapter();
		adapter.install(tempDir);
		adapter.remove(tempDir);

		const settingsPath = adapter.settingsPath(tempDir);
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(settings.hooks).toBeUndefined();
	});

	test("checkStatus returns correct status", () => {
		const adapter = new ClaudeCodeAdapter();
		let status = adapter.checkStatus(tempDir);
		expect(status.postReadActive).toBe(false);

		adapter.install(tempDir);
		status = adapter.checkStatus(tempDir);
		expect(status.postReadActive).toBe(true);
	});
});

describe("ClaudeDesktopAdapter", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `crp-desktop-adapter-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("settingsPath returns .claude/settings.json", () => {
		const adapter = new ClaudeDesktopAdapter();
		expect(adapter.settingsPath(tempDir)).toBe(
			join(tempDir, ".claude", "settings.json"),
		);
	});
});

describe("detectAdapter", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `crp-detect-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("returns ClaudeCodeAdapter when settings.local.json exists", () => {
		const claudeDir = join(tempDir, ".claude");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(join(claudeDir, "settings.local.json"), "{}", "utf-8");

		const adapter = detectAdapter(tempDir);
		expect(adapter).not.toBeNull();
		expect(adapter?.name).toBe("claude-code");
	});

	test("returns ClaudeDesktopAdapter when only settings.json exists", () => {
		const claudeDir = join(tempDir, ".claude");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(join(claudeDir, "settings.json"), "{}", "utf-8");

		const adapter = detectAdapter(tempDir);
		expect(adapter).not.toBeNull();
		expect(adapter?.name).toBe("claude-desktop");
	});

	test("returns null when no settings files exist", () => {
		const adapter = detectAdapter(tempDir);
		expect(adapter).toBeNull();
	});
});

describe("getDefaultAdapter", () => {
	test("returns ClaudeCodeAdapter as fallback", () => {
		const adapter = getDefaultAdapter();
		expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
	});
});
