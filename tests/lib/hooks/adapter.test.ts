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
	ClaudeSettingsAdapter,
	detectAdapter,
	getDefaultAdapter,
} from "../../../src/lib/hooks/adapter";

// Both Claude Code CLI (settings.local.json) and Claude Desktop
// (settings.json) accept the same nested hook format — the adapter is
// parameterized only by settings filename. We exercise both paths so a
// format drift between them cannot slip in silently.
const CODE_FIXTURE = {
	name: "claude-code" as const,
	settingsFileName: "settings.local.json" as const,
};
const DESKTOP_FIXTURE = {
	name: "claude-desktop" as const,
	settingsFileName: "settings.json" as const,
};
const FIXTURES = [CODE_FIXTURE, DESKTOP_FIXTURE];

describe("ClaudeSettingsAdapter", () => {
	describe("settingsPath", () => {
		test("claude-code resolves to .claude/settings.local.json", () => {
			const adapter = new ClaudeSettingsAdapter(
				CODE_FIXTURE.name,
				CODE_FIXTURE.settingsFileName,
			);
			expect(adapter.settingsPath("/proj")).toBe(
				join("/proj", ".claude", "settings.local.json"),
			);
		});

		test("claude-desktop resolves to .claude/settings.json", () => {
			const adapter = new ClaudeSettingsAdapter(
				DESKTOP_FIXTURE.name,
				DESKTOP_FIXTURE.settingsFileName,
			);
			expect(adapter.settingsPath("/proj")).toBe(
				join("/proj", ".claude", "settings.json"),
			);
		});
	});

	for (const fixture of FIXTURES) {
		describe(`behavior (${fixture.name})`, () => {
			let tempDir: string;

			beforeEach(() => {
				tempDir = join(tmpdir(), `crp-adapter-test-${Date.now()}`);
				mkdirSync(tempDir, { recursive: true });
			});

			afterEach(() => {
				rmSync(tempDir, { recursive: true, force: true });
			});

			function makeAdapter(): ClaudeSettingsAdapter {
				return new ClaudeSettingsAdapter(
					fixture.name,
					fixture.settingsFileName,
				);
			}

			test("install creates settings file with PostToolUse hook", () => {
				const adapter = makeAdapter();
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
				const innerHooks = postToolUse[0].hooks as Array<
					Record<string, unknown>
				>;
				expect(innerHooks.length).toBeGreaterThan(0);
				expect((innerHooks[0].command as string).includes("post-read")).toBe(
					true,
				);
			});

			test("install does not add SessionStart hook", () => {
				const adapter = makeAdapter();
				adapter.install(tempDir);

				const settingsPath = adapter.settingsPath(tempDir);
				const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
				expect(settings.hooks?.SessionStart).toBeUndefined();
			});

			test("install removes legacy SessionStart hook", () => {
				const adapter = makeAdapter();
				const settingsPath = adapter.settingsPath(tempDir);
				const claudeDir = join(tempDir, ".claude");
				mkdirSync(claudeDir, { recursive: true });

				// Pre-populate with a legacy SessionStart hook
				const existingSettings = {
					hooks: {
						SessionStart: [
							{ command: 'bun run ".crp/hooks/session-start.ts"' },
						],
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
				const adapter = makeAdapter();
				adapter.install(tempDir);
				adapter.install(tempDir);

				const settingsPath = adapter.settingsPath(tempDir);
				const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
				const postToolUse = (settings.hooks as Record<string, unknown>)
					.PostToolUse as Array<Record<string, unknown>>;
				const postReadHooks = postToolUse.filter((h) =>
					(h.hooks as Array<Record<string, unknown>>)?.some(
						(ih) =>
							typeof ih.command === "string" &&
							ih.command.includes("post-read"),
					),
				);
				expect(postReadHooks.length).toBe(1);
			});

			test("remove cleans up hooks", () => {
				const adapter = makeAdapter();
				adapter.install(tempDir);
				adapter.remove(tempDir);

				const settingsPath = adapter.settingsPath(tempDir);
				const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
				expect(settings.hooks).toBeUndefined();
			});

			test("checkStatus reports postReadActive after install", () => {
				const adapter = makeAdapter();
				expect(adapter.checkStatus(tempDir).postReadActive).toBe(false);

				adapter.install(tempDir);
				expect(adapter.checkStatus(tempDir).postReadActive).toBe(true);
			});
		});
	}
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

	test("returns claude-code adapter when settings.local.json exists", () => {
		const claudeDir = join(tempDir, ".claude");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(join(claudeDir, "settings.local.json"), "{}", "utf-8");

		const adapter = detectAdapter(tempDir);
		expect(adapter).not.toBeNull();
		expect(adapter?.name).toBe("claude-code");
		expect(adapter).toBeInstanceOf(ClaudeSettingsAdapter);
	});

	test("returns claude-desktop adapter when only settings.json exists", () => {
		const claudeDir = join(tempDir, ".claude");
		mkdirSync(claudeDir, { recursive: true });
		writeFileSync(join(claudeDir, "settings.json"), "{}", "utf-8");

		const adapter = detectAdapter(tempDir);
		expect(adapter).not.toBeNull();
		expect(adapter?.name).toBe("claude-desktop");
		expect(adapter).toBeInstanceOf(ClaudeSettingsAdapter);
	});

	test("returns null when no settings files exist", () => {
		const adapter = detectAdapter(tempDir);
		expect(adapter).toBeNull();
	});
});

describe("getDefaultAdapter", () => {
	test("returns ClaudeSettingsAdapter (claude-code) as fallback", () => {
		const adapter = getDefaultAdapter();
		expect(adapter).toBeInstanceOf(ClaudeSettingsAdapter);
		expect(adapter.name).toBe("claude-code");
	});
});
