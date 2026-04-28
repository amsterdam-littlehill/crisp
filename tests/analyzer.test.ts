import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeReads } from "../src/lib/crp/analyzer";

describe("analyzeReads", () => {
	let tempDir: string;
	let logPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crisp-test-"));
		logPath = join(tempDir, "reads.jsonl");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("normal reads.jsonl parsing and frequency calculation", () => {
		const now = new Date().toISOString();
		const lines = [
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/skill-a/SKILL.md",
				tokens: 100,
			}),
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/skill-b/SKILL.md",
				tokens: 200,
			}),
			JSON.stringify({
				ts: now,
				session_id: "s2",
				file: "skills/skill-a/SKILL.md",
				tokens: 100,
			}),
		];
		writeFileSync(logPath, lines.join("\n"));

		const result = analyzeReads(logPath, 30);
		expect(result.length).toBe(2);

		const skillA = result.find((r) => r.name === "skill-a");
		const skillB = result.find((r) => r.name === "skill-b");

		expect(skillA).toBeDefined();
		expect(skillA!.freq).toBe(1.0); // 2 sessions / 2 total
		expect(skillA!.sessions).toBe(2);

		expect(skillB).toBeDefined();
		expect(skillB!.freq).toBe(0.5); // 1 session / 2 total
		expect(skillB!.sessions).toBe(1);
	});

	test("empty file returns empty array", () => {
		writeFileSync(logPath, "");
		const result = analyzeReads(logPath, 30);
		expect(result).toEqual([]);
	});

	test("invalid JSON lines are skipped", () => {
		const now = new Date().toISOString();
		const lines = [
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/skill-a/SKILL.md",
				tokens: 100,
			}),
			"not valid json",
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/skill-b/SKILL.md",
				tokens: 200,
			}),
		];
		writeFileSync(logPath, lines.join("\n"));

		const result = analyzeReads(logPath, 30);
		expect(result.length).toBe(2);
	});

	test("records outside windowDays are excluded", () => {
		const now = Date.now();
		const oldTs = new Date(now - 40 * 86400000).toISOString();
		const recentTs = new Date(now - 5 * 86400000).toISOString();

		const lines = [
			JSON.stringify({
				ts: oldTs,
				session_id: "s1",
				file: "skills/old-skill/SKILL.md",
				tokens: 100,
			}),
			JSON.stringify({
				ts: recentTs,
				session_id: "s2",
				file: "skills/recent-skill/SKILL.md",
				tokens: 200,
			}),
		];
		writeFileSync(logPath, lines.join("\n"));

		const result = analyzeReads(logPath, 30);
		expect(result.length).toBe(1);
		expect(result[0].name).toBe("recent-skill");
	});

	test("duplicate skills in same session counted once", () => {
		const now = new Date().toISOString();
		const lines = [
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/skill-a/SKILL.md",
				tokens: 100,
			}),
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/skill-a/SKILL.md",
				tokens: 100,
			}),
		];
		writeFileSync(logPath, lines.join("\n"));

		const result = analyzeReads(logPath, 30);
		expect(result.length).toBe(1);
		expect(result[0].name).toBe("skill-a");
		expect(result[0].sessions).toBe(1);
		expect(result[0].freq).toBe(1.0);
	});

	test("different path formats extract skill name correctly", () => {
		const now = new Date().toISOString();
		const lines = [
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "my-skill.skill.md",
				tokens: 100,
			}),
			JSON.stringify({
				ts: now,
				session_id: "s1",
				file: "skills/other-skill/SKILL.md",
				tokens: 200,
			}),
		];
		writeFileSync(logPath, lines.join("\n"));

		const result = analyzeReads(logPath, 30);
		expect(result.length).toBe(2);
		expect(result.some((r) => r.name === "my-skill")).toBe(true);
		expect(result.some((r) => r.name === "other-skill")).toBe(true);
	});
});
