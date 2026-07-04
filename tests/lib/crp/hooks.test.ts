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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildFallbackMessage,
	buildInjection,
	runSessionStart,
} from "../../../src/lib/crp/hooks/session-start";

// The deployed hook is templates/hooks/post-read.mjs (a plain ESM script).
// Test it through its real interface — spawn it as a subprocess — so the
// tested artifact IS the deployed artifact. (The old src/lib/crp/hooks/post-read.ts
// parallel was tested but never deployed; it is gone.)
const HOOKS_TEST_DIR = dirname(fileURLToPath(import.meta.url));
const POST_READ_MJS = join(
	HOOKS_TEST_DIR,
	"..",
	"..",
	"..",
	"templates",
	"hooks",
	"post-read.mjs",
);

describe("post-read.mjs hook (deployed artifact, run as subprocess)", () => {
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

	function runHook(envInput: string): { exitCode: number; stdout: string } {
		const proc = Bun.spawnSync({
			cmd: ["bun", POST_READ_MJS],
			cwd: tempDir,
			env: {
				...process.env,
				CLAUDE_PROJECT_DIR: tempDir,
				CLAUDE_HOOK_INPUT: envInput,
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		return {
			exitCode: proc.exitCode,
			stdout: proc.stdout == null ? "" : new TextDecoder().decode(proc.stdout),
		};
	}

	test("records a skill file read", () => {
		const envInput = JSON.stringify({
			session_id: "sess-123",
			tool_input: {
				file_path: join(tempDir, ".claude", "skills", "backend.skill.md"),
			},
		});
		const { exitCode, stdout } = runHook(envInput);
		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe("{}");
		expect(existsSync(readsPath)).toBe(true);
		const lines = readFileSync(readsPath, "utf-8").trim().split("\n");
		expect(lines.length).toBe(1);
		const record = JSON.parse(lines[0]);
		expect(record.session_id).toBe("sess-123");
		expect(record.file).toContain("backend.skill.md");
		expect(record.tokens).toBeNumber();
	});

	test("ignores non-skill files", () => {
		const envInput = JSON.stringify({
			session_id: "sess-456",
			tool_input: { file_path: join(tempDir, "src", "main.ts") },
		});
		const { exitCode } = runHook(envInput);
		expect(exitCode).toBe(0);
		expect(existsSync(readsPath)).toBe(false);
	});

	test("handles invalid JSON gracefully", () => {
		const { exitCode } = runHook("not-json");
		expect(exitCode).toBe(0);
		expect(existsSync(errorPath)).toBe(true);
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
