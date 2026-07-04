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
