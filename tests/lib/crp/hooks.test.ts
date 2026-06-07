import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkHookStatus,
	installHooks,
	removeHooks,
} from "../../../src/lib/crp/hooks/inject";
import {
	buildReadRecord,
	isSkillFile,
	logError,
	runPostRead,
} from "../../../src/lib/crp/hooks/post-read";
import {
	buildFallbackMessage,
	buildInjection,
	runSessionStart,
} from "../../../src/lib/crp/hooks/session-start";

const _PROJECT_ROOT = join(import.meta.dirname, "../../../../");

describe("inject.ts", () => {
	let tempDir: string;
	let settingsPath: string;
	let crpDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-hooks-test-"));
		settingsPath = join(tempDir, ".claude", "settings.json");
		crpDir = join(tempDir, ".crp");
		mkdirSync(join(crpDir, "hooks"), { recursive: true });
		writeFileSync(join(crpDir, "hooks", "post-read.mjs"), "// dummy", "utf-8");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("installHooks", () => {
		test("creates settings.json with PostToolUse hook when none exists", () => {
			installHooks(tempDir, settingsPath);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(settings.hooks).toBeDefined();
			expect(settings.hooks.PostToolUse).toBeArray();
			expect(settings.hooks.PostToolUse.length).toBe(1);
			// SessionStart should NOT be present (migrated to CLAUDE.md)
			expect(settings.hooks.SessionStart).toBeUndefined();
		});

		test("does not duplicate hooks on repeated install", () => {
			installHooks(tempDir, settingsPath);
			installHooks(tempDir, settingsPath);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(settings.hooks.PostToolUse.length).toBe(1);
		});

		test("hook command references post-read.mjs script path", () => {
			installHooks(tempDir, settingsPath);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			const postHook = settings.hooks.PostToolUse[0];
			expect(postHook.matcher).toBe("Read");
			const innerHooks = postHook.hooks as Array<Record<string, unknown>>;
			expect(innerHooks.length).toBe(1);
			expect(innerHooks[0].type).toBe("command");
			expect((innerHooks[0].command as string).includes("post-read.mjs")).toBe(
				true,
			);
		});

		test("removes legacy SessionStart hook during install", () => {
			// Pre-populate with a legacy SessionStart hook
			mkdirSync(join(tempDir, ".claude"), { recursive: true });
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

			installHooks(tempDir, settingsPath);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(settings.hooks?.SessionStart).toBeUndefined();
			expect(settings.hooks?.PostToolUse).toBeDefined();
		});
	});

	describe("removeHooks", () => {
		test("removes PostToolUse hook from settings", () => {
			installHooks(tempDir, settingsPath);
			removeHooks(settingsPath);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(settings.hooks?.PostToolUse).toBeUndefined();
		});

		test("is safe when settings.json does not exist", () => {
			expect(() =>
				removeHooks(join(tempDir, "nonexistent.json")),
			).not.toThrow();
		});

		test("cleans up empty hooks object", () => {
			installHooks(tempDir, settingsPath);
			removeHooks(settingsPath);

			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(settings.hooks).toBeUndefined();
		});
	});

	describe("checkHookStatus", () => {
		test("returns false when no settings exist", () => {
			const status = checkHookStatus(settingsPath);
			expect(status.postReadActive).toBe(false);
			expect(status.sessionStartActive).toBe(false);
		});

		test("returns postReadActive true after installation", () => {
			installHooks(tempDir, settingsPath);
			const status = checkHookStatus(settingsPath);
			expect(status.postReadActive).toBe(true);
			// sessionStartActive should be false (SessionStart removed, CLAUDE.md handles injection)
			expect(status.sessionStartActive).toBe(false);
		});

		test("returns false after removal", () => {
			installHooks(tempDir, settingsPath);
			removeHooks(settingsPath);
			const status = checkHookStatus(settingsPath);
			expect(status.postReadActive).toBe(false);
			expect(status.sessionStartActive).toBe(false);
		});
	});
});

describe("post-read.ts logic", () => {
	let tempDir: string;
	let readsPath: string;
	let errorPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-post-read-test-"));
		readsPath = join(tempDir, ".crp", "telemetry", "reads.jsonl");
		errorPath = join(tempDir, ".crp", "logs", "hook-errors.jsonl");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("isSkillFile identifies skill paths", () => {
		expect(isSkillFile("/project/.claude/skills/backend.skill.md")).toBe(true);
		expect(isSkillFile("/project/.claude/skills/backend.md")).toBe(true);
		expect(isSkillFile("/project/src/main.ts")).toBe(false);
		expect(isSkillFile("/project/README.md")).toBe(false);
	});

	test("buildReadRecord creates valid record", () => {
		const record = buildReadRecord("sess-123", "/path/to/skill.md", 42);
		expect(record.session_id).toBe("sess-123");
		expect(record.file).toBe("/path/to/skill.md");
		expect(record.tokens).toBe(42);
		expect(record.ts).toBeString();
	});

	test("runPostRead records skill file read", () => {
		const envInput = JSON.stringify({
			session_id: "sess-123",
			tool_input: { file_path: "/project/.claude/skills/backend.skill.md" },
		});

		const exitCode = runPostRead(envInput, readsPath, errorPath);
		expect(exitCode).toBe(0);

		expect(existsSync(readsPath)).toBe(true);
		const lines = readFileSync(readsPath, "utf-8").trim().split("\n");
		expect(lines.length).toBe(1);
		const record = JSON.parse(lines[0]);
		expect(record.session_id).toBe("sess-123");
		expect(record.file).toContain("backend.skill.md");
		expect(record.tokens).toBeNumber();
	});

	test("runPostRead ignores non-skill files", () => {
		const envInput = JSON.stringify({
			session_id: "sess-456",
			tool_input: { file_path: "/project/src/main.ts" },
		});

		const exitCode = runPostRead(envInput, readsPath, errorPath);
		expect(exitCode).toBe(0);
		expect(existsSync(readsPath)).toBe(false);
	});

	test("runPostRead handles invalid JSON gracefully", () => {
		const exitCode = runPostRead("not-json", readsPath, errorPath);
		expect(exitCode).toBe(0);
		expect(existsSync(errorPath)).toBe(true);
	});

	test("logError writes to error log", () => {
		logError("test error", errorPath);
		expect(existsSync(errorPath)).toBe(true);
		const lines = readFileSync(errorPath, "utf-8").trim().split("\n");
		expect(lines.length).toBe(1);
		const record = JSON.parse(lines[0]);
		expect(record.error).toBe("test error");
		expect(record.hook).toBe("post-read");
	});
});

describe("session-start.ts logic", () => {
	let tempDir: string;
	let routesPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-session-start-test-"));
		routesPath = join(tempDir, ".crp", "routes.json");
		mkdirSync(join(tempDir, ".crp"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("buildFallbackMessage returns expected text", () => {
		const msg = buildFallbackMessage();
		expect(msg).toContain("[CRP]");
		expect(msg).toContain("crp sync");
	});

	test("runSessionStart returns fallback when routes.json missing", () => {
		const output = runSessionStart(routesPath);
		expect(output).toContain("[CRP]");
	});

	test("buildInjection generates expected format", () => {
		const routes = {
			version: 3,
			skills: [
				{
					name: "backend",
					strategy: "inline" as const,
					freq: 0.82,
					summary: "NestJS API patterns",
				},
				{
					name: "testing",
					strategy: "lazy" as const,
					freq: 0.22,
					hint: "Load via Skill('testing')",
				},
				{ name: "docs", strategy: "dead" as const, freq: 0.02 },
			],
			kg: { topics: ["auth", "db"], query_command: "crp kg '<topic>'" },
		};
		const output = buildInjection(routes);
		expect(output).toContain("[CRP Router]");
		expect(output).toContain("backend");
		expect(output).toContain("testing");
		expect(output).toContain("docs");
		expect(output).toContain("auth");
	});

	test("runSessionStart reads routes.json and generates injection", () => {
		const routes = {
			version: 3,
			skills: [
				{
					name: "backend",
					strategy: "inline" as const,
					freq: 0.82,
					summary: "NestJS API patterns",
				},
				{
					name: "testing",
					strategy: "lazy" as const,
					freq: 0.22,
					hint: "Load via Skill('testing')",
				},
				{ name: "docs", strategy: "dead" as const, freq: 0.02 },
			],
			kg: { topics: ["auth", "db"], query_command: "crp kg '<topic>'" },
		};
		writeFileSync(routesPath, JSON.stringify(routes, null, 2), "utf-8");

		const output = runSessionStart(routesPath);
		expect(output).toContain("[CRP Router]");
		expect(output).toContain("backend");
		expect(output).toContain("testing");
		expect(output).toContain("docs");
	});

	test("runSessionStart handles empty skills array", () => {
		writeFileSync(
			routesPath,
			JSON.stringify({ version: 3, skills: [] }),
			"utf-8",
		);
		const output = runSessionStart(routesPath);
		expect(output).toContain("[CRP]");
	});
});
