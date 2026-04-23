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

describe("recordReadEvent", () => {
	test("creates log file with event", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-tel-"));
		const logPath = join(dir, "log.jsonl");
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
				rmSync(".crisp", { recursive: true, force: true });
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
		writeFileSync(logPath, lines.join("\n") + "\n");
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
		writeFileSync(logPath, lines.join("\n") + "\n");
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
							"bun run .claude/hooks/telemetry-hook.ts --read ${file_path}",
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
							"bun run .claude/hooks/telemetry-hook.ts --read ${file_path}",
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
