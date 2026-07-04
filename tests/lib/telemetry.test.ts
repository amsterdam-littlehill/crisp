import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdTelemetryStatus } from "../../src/commands/telemetry";
import { runReport } from "../../src/lib/telemetry/reporter";

describe("cmdTelemetryStatus", () => {
	test("reports ACTIVE and counts events from reads.jsonl", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-status-"));
		const originalCwd = process.cwd();
		process.chdir(dir);

		// Install the canonical post-read hook so checkStatus reports ACTIVE.
		// settings.local.json is the claude-code adapter's file, so it wins
		// detection priority.
		mkdirSync(join(dir, ".claude"), { recursive: true });
		writeFileSync(
			join(dir, ".claude", "settings.local.json"),
			JSON.stringify({
				hooks: {
					PostToolUse: [
						{
							matcher: "Read",
							hooks: [
								{
									type: "command",
									command: `node "${join(dir, ".crp", "hooks", "post-read.mjs")}"`,
								},
							],
						},
					],
				},
			}),
			"utf-8",
		);

		// Seed reads.jsonl with two events
		mkdirSync(join(dir, ".crp", "telemetry"), { recursive: true });
		const reads = [
			{
				ts: "2026-04-30T10:00:00Z",
				session_id: "s1",
				file: "skills/backend/SKILL.md",
				tokens: 100,
			},
			{
				ts: "2026-04-30T10:05:00Z",
				session_id: "s1",
				file: "skills/backend/SKILL.md",
				tokens: 100,
			},
		];
		writeFileSync(
			join(dir, ".crp", "telemetry", "reads.jsonl"),
			`${reads.map((r) => JSON.stringify(r)).join("\n")}\n`,
			"utf-8",
		);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.join(" "));
		};

		try {
			const code = cmdTelemetryStatus();
			expect(code).toBe(0);
			const output = logs.join("\n");
			expect(output).toContain("Telemetry hook: ACTIVE");
			expect(output).toContain("Events recorded: 2");
		} finally {
			console.log = originalLog;
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("reports INACTIVE and zero events when nothing is set up", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-empty-"));
		const originalCwd = process.cwd();
		process.chdir(dir);

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.join(" "));
		};

		try {
			const code = cmdTelemetryStatus();
			expect(code).toBe(0);
			const output = logs.join("\n");
			expect(output).toContain("Telemetry hook: INACTIVE");
			expect(output).toContain("Events recorded: 0");
		} finally {
			console.log = originalLog;
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runReport", () => {
	test("reads reads.jsonl", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-report-"));
		const originalCwd = process.cwd();
		process.chdir(dir);

		// Create reads.jsonl (from post-read hook)
		mkdirSync(join(dir, ".crp", "telemetry"), { recursive: true });
		const reads = [
			{
				ts: "2026-04-30T10:00:00Z",
				session_id: "s1",
				file: "skills/backend/SKILL.md",
				tokens: 450,
			},
			{
				ts: "2026-04-30T10:05:00Z",
				session_id: "s1",
				file: "skills/backend/SKILL.md",
				tokens: 450,
			},
		];
		writeFileSync(
			join(dir, ".crp", "telemetry", "reads.jsonl"),
			`${reads.map((r) => JSON.stringify(r)).join("\n")}\n`,
			"utf-8",
		);

		// Create crp.yaml so runReport doesn't exit early
		writeFileSync(join(dir, "crp.yaml"), "project:\n  name: test\n", "utf-8");

		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (...args: unknown[]) => {
			logs.push(args.join(" "));
		};

		try {
			const code = runReport();
			expect(code).toBe(0);
			const output = logs.join("\n");
			expect(output).toContain("Total READ events: 2");
			expect(output).toContain("Total tokens loaded: 900");
			expect(output).toContain("skills/backend/SKILL.md");
		} finally {
			console.log = originalLog;
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
