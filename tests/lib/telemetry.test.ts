import { describe, expect, test } from "bun:test";
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
	injectHook,
	removeHook,
} from "../../src/lib/telemetry/hooks";
import {
	getLogStats,
	loadTelemetryLog,
	recordReadEvent,
} from "../../src/lib/telemetry/logger";
import { loadRawReads, runReport } from "../../src/lib/telemetry/reporter";

describe("recordReadEvent", () => {
	test("creates log file with event", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const _logPath = join(dir, "log.jsonl");
		recordReadEvent({
			timestamp: "2024-01-01T00:00:00Z",
			event_type: "READ",
			file: "test.md",
			skill: "backend",
			tokens: 100,
			tier: "hot",
		});
		try {
			const events = loadTelemetryLog();
			expect(events.length).toBeGreaterThan(0);
			const last = events[events.length - 1];
			expect(last.event_type).toBe("READ");
			expect(last.file).toBe("test.md");
			expect(last.skill).toBe("backend");
			expect(last.tokens).toBe(100);
		} finally {
			// Clean up global state
			try {
				rmSync(".crp", { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	});
});

describe("loadTelemetryLog", () => {
	test("returns empty for missing file", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "nonexistent.jsonl");
		const events = loadTelemetryLog(logPath);
		expect(events).toEqual([]);
		rmSync(dir, { recursive: true, force: true });
	});

	test("parses valid events", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "log.jsonl");
		const lines = [
			JSON.stringify({ event_type: "READ", file: "a.md", tokens: 10 }),
			JSON.stringify({ event_type: "READ", file: "b.md", tokens: 20 }),
		];
		writeFileSync(logPath, `${lines.join("\n")}\n`);
		try {
			const events = loadTelemetryLog(logPath);
			expect(events.length).toBe(2);
			expect(events[0].file).toBe("a.md");
			expect(events[1].file).toBe("b.md");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("skips malformed lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "log.jsonl");
		writeFileSync(
			logPath,
			'{"event_type":"READ"}\nnot-json\n{"file":"c.md"}\n',
		);
		try {
			const events = loadTelemetryLog(logPath);
			expect(events.length).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns empty for empty file", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "log.jsonl");
		writeFileSync(logPath, "");
		try {
			const events = loadTelemetryLog(logPath);
			expect(events).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("getLogStats", () => {
	test("returns zeros for empty log", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "log.jsonl");
		writeFileSync(logPath, "");
		try {
			const stats = getLogStats(logPath);
			expect(stats.total_events).toBe(0);
			expect(stats.total_reads).toBe(0);
			expect(stats.total_tokens).toBe(0);
			expect(stats.top_files).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("aggregates read events", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "log.jsonl");
		const lines = [
			JSON.stringify({ event_type: "READ", file: "a.md", tokens: 10 }),
			JSON.stringify({ event_type: "READ", file: "a.md", tokens: 20 }),
			JSON.stringify({ event_type: "WRITE", file: "b.md", tokens: 5 }),
		];
		writeFileSync(logPath, `${lines.join("\n")}\n`);
		try {
			const stats = getLogStats(logPath);
			expect(stats.total_events).toBe(3);
			expect(stats.total_reads).toBe(2);
			expect(stats.total_tokens).toBe(30);
			expect((stats.top_files as Array<Record<string, unknown>>).length).toBe(
				1,
			);
			expect((stats.top_files as Array<Record<string, unknown>>)[0].file).toBe(
				"a.md",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("injectHook", () => {
	test("creates settings.json and hook script", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-hook-"));
		const settingsPath = join(dir, "settings.json");
		try {
			injectHook(settingsPath);
			expect(existsSync(settingsPath)).toBe(true);
			const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(settings.hooks).toBeDefined();
			expect(Array.isArray(settings.hooks.PostToolUse)).toBe(true);
			const hookCmd = settings.hooks.PostToolUse.find(
				(h: Record<string, unknown>) =>
					typeof h.command === "string" && h.command.includes("telemetry-hook"),
			);
			expect(hookCmd).toBeDefined();
			expect(hookCmd.tool).toBe("Read");
		} finally {
			rmSync(dir, { recursive: true, force: true });
			try {
				rmSync(".claude", { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	});
});

describe("removeHook", () => {
	test("removes hook from settings", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-hook-"));
		const settingsPath = join(dir, "settings.json");
		const settings = {
			hooks: {
				PostToolUse: [
					{
						tool: "Read",
						command:
							"bun run .claude/hooks/telemetry-hook.ts --read " +
							"$" +
							"{file_path}",
					},
					{ tool: "Edit", command: "other" },
				],
			},
		};
		writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
		try {
			removeHook(settingsPath);
			const updated = JSON.parse(readFileSync(settingsPath, "utf-8"));
			expect(updated.hooks.PostToolUse.length).toBe(1);
			expect(updated.hooks.PostToolUse[0].tool).toBe("Edit");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("handles missing settings file", () => {
		expect(() => removeHook("/nonexistent/settings.json")).not.toThrow();
	});
});

describe("checkHookStatus", () => {
	test("returns inactive for missing settings", () => {
		const status = checkHookStatus("/nonexistent/settings.json");
		expect(status.active).toBe(false);
		expect(status.eventCount).toBe(0);
	});

	test("detects active hook", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-hook-"));
		const settingsPath = join(dir, "settings.json");
		const settings = {
			hooks: {
				PostToolUse: [
					{
						tool: "Read",
						command:
							"bun run .claude/hooks/telemetry-hook.ts --read " +
							"$" +
							"{file_path}",
					},
				],
			},
		};
		writeFileSync(settingsPath, JSON.stringify(settings));
		try {
			const status = checkHookStatus(settingsPath);
			expect(status.active).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("loadRawReads", () => {
	test("returns empty for missing file", () => {
		const events = loadRawReads("/nonexistent/reads.jsonl");
		expect(events).toEqual([]);
	});

	test("returns empty for empty file", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-rawreads-"));
		const path = join(dir, "reads.jsonl");
		writeFileSync(path, "", "utf-8");
		try {
			const events = loadRawReads(path);
			expect(events).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("normalizes reads.jsonl format", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-rawreads-"));
		const path = join(dir, "reads.jsonl");
		const lines = [
			JSON.stringify({
				ts: "2026-04-30T10:00:00Z",
				session_id: "s1",
				file: "skills/backend/SKILL.md",
				tokens: 450,
			}),
			JSON.stringify({
				ts: "2026-04-30T10:05:00Z",
				session_id: "s1",
				file: "skills/frontend/SKILL.md",
				tokens: 380,
			}),
		];
		writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
		try {
			const events = loadRawReads(path);
			expect(events.length).toBe(2);
			expect(events[0].timestamp).toBe("2026-04-30T10:00:00Z");
			expect(events[0].event_type).toBe("READ");
			expect(events[0].file).toBe("skills/backend/SKILL.md");
			expect(events[0].skill).toBe("backend");
			expect(events[0].tokens).toBe(450);
			expect(events[0].tier).toBe("L0");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("skips malformed lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-rawreads-"));
		const path = join(dir, "reads.jsonl");
		writeFileSync(
			path,
			'{"ts":"2026-04-30T10:00:00Z","file":"a.md"}\nnot-json\n{"file":"b.md"}\n',
			"utf-8",
		);
		try {
			const events = loadRawReads(path);
			expect(events.length).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runReport", () => {
	test("merges both log.jsonl and reads.jsonl, deduping exact duplicates", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-report-merge-"));
		const originalCwd = process.cwd();
		process.chdir(dir);

		mkdirSync(join(dir, ".crp", "telemetry"), { recursive: true });

		// log.jsonl has one event
		writeFileSync(
			join(dir, ".crp", "telemetry", "log.jsonl"),
			`${JSON.stringify({
				timestamp: "2026-04-30T10:00:00Z",
				event_type: "READ",
				file: "skills/backend/SKILL.md",
				skill: "backend",
				tokens: 450,
				tier: "L0",
			})}\n`,
			"utf-8",
		);

		// reads.jsonl has the same event (exact duplicate) plus a different one
		writeFileSync(
			join(dir, ".crp", "telemetry", "reads.jsonl"),
			`${[
				JSON.stringify({
					ts: "2026-04-30T10:00:00Z",
					session_id: "s1",
					file: "skills/backend/SKILL.md",
					tokens: 450,
				}),
				JSON.stringify({
					ts: "2026-04-30T10:05:00Z",
					session_id: "s1",
					file: "skills/frontend/SKILL.md",
					tokens: 380,
				}),
			].join("\n")}\n`,
			"utf-8",
		);

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
			// 2 unique events (backend deduped, frontend new)
			expect(output).toContain("Total READ events: 2");
			expect(output).toContain("Total tokens loaded: 830");
		} finally {
			console.log = originalLog;
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("reads reads.jsonl when log.jsonl is empty", () => {
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
