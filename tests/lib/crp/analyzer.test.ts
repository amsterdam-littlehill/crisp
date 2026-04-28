import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeReads } from "../../../src/lib/crp/analyzer";

describe("analyzer.ts", () => {
	let tempDir: string;
	let readsPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-analyzer-test-"));
		readsPath = join(tempDir, "reads.jsonl");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writeRecords(records: unknown[]) {
		const lines = records.map((r) => JSON.stringify(r)).join("\n");
		writeFileSync(readsPath, `${lines}\n`, "utf-8");
	}

	test("returns empty array for missing file", () => {
		const result = analyzeReads(join(tempDir, "missing.jsonl"));
		expect(result).toBeEmpty();
	});

	test("calculates frequency from single session", () => {
		const now = new Date().toISOString();
		writeRecords([
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/frontend/SKILL.md",
				tokens: 10,
			},
		]);

		const result = analyzeReads(readsPath, 30);
		expect(result).toHaveLength(2);
		const backend = result.find((r) => r.name === "backend");
		expect(backend?.freq).toBe(1);
		expect(backend?.sessions).toBe(1);
	});

	test("deduplicates reads within same session", () => {
		const now = new Date().toISOString();
		writeRecords([
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
		]);

		const result = analyzeReads(readsPath, 30);
		expect(result).toHaveLength(1);
		expect(result[0].freq).toBe(1);
		expect(result[0].sessions).toBe(1);
	});

	test("calculates frequency across multiple sessions", () => {
		const now = new Date().toISOString();
		writeRecords([
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s2",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s3",
				file: "/project/.claude/skills/frontend/SKILL.md",
				tokens: 10,
			},
		]);

		const result = analyzeReads(readsPath, 30);
		expect(result).toHaveLength(2);
		const backend = result.find((r) => r.name === "backend");
		expect(backend?.freq).toBe(2 / 3);
		const frontend = result.find((r) => r.name === "frontend");
		expect(frontend?.freq).toBe(1 / 3);
	});

	test("filters out records outside window", () => {
		const oldDate = new Date(
			Date.now() - 40 * 24 * 60 * 60 * 1000,
		).toISOString();
		const now = new Date().toISOString();
		writeRecords([
			{
				ts: oldDate,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s2",
				file: "/project/.claude/skills/frontend/SKILL.md",
				tokens: 10,
			},
		]);

		const result = analyzeReads(readsPath, 30);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("frontend");
	});

	test("ignores non-skill files", () => {
		const now = new Date().toISOString();
		writeRecords([
			{ ts: now, session_id: "s1", file: "/project/src/main.ts", tokens: 10 },
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
		]);

		const result = analyzeReads(readsPath, 30);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("backend");
	});

	test("sorts by frequency descending", () => {
		const now = new Date().toISOString();
		writeRecords([
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/rare.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/common/SKILL.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s2",
				file: "/project/.claude/skills/common/SKILL.md",
				tokens: 10,
			},
		]);

		const result = analyzeReads(readsPath, 30);
		expect(result[0].name).toBe("common");
		expect(result[1].name).toBe("rare");
	});
});
