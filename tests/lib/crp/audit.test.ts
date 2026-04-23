import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCrpAudit } from "../../../src/lib/crp/audit";

describe("audit.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-audit-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		mkdirSync(join(tempDir, ".crp", "telemetry"), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("returns empty result when no routes", () => {
		const result = runCrpAudit(tempDir);
		expect(result.inlineCount).toBe(0);
		expect(result.deadCandidates).toBeEmpty();
	});

	test("identifies dead candidates from routes and reads", () => {
		const now = new Date().toISOString();
		const oldDate = new Date(
			Date.now() - 20 * 24 * 60 * 60 * 1000,
		).toISOString();

		writeFileSync(
			join(tempDir, ".crp", "telemetry", "reads.jsonl"),
			[
				JSON.stringify({
					ts: oldDate,
					session_id: "s1",
					file: "/skills/backend.skill.md",
					tokens: 10,
				}),
				JSON.stringify({
					ts: now,
					session_id: "s2",
					file: "/skills/frontend/SKILL.md",
					tokens: 10,
				}),
			].join("\n") + "\n",
			"utf-8",
		);

		writeFileSync(
			join(tempDir, ".crp", "routes.json"),
			JSON.stringify({
				version: 3,
				skills: [
					{ name: "backend", strategy: "inline", freq: 0.5 },
					{ name: "frontend", strategy: "inline", freq: 0.5 },
				],
				l0_inject_tokens: 50,
			}),
			"utf-8",
		);

		const result = runCrpAudit(tempDir);
		// backend has 0 reads in last 14 days
		expect(result.deadCandidates).toContain("backend");
		// frontend has recent reads
		expect(result.deadCandidates).not.toContain("frontend");
	});

	test("computes tier counts from routes", () => {
		writeFileSync(
			join(tempDir, ".crp", "routes.json"),
			JSON.stringify({
				version: 3,
				skills: [
					{ name: "a", strategy: "inline", freq: 0.8 },
					{ name: "b", strategy: "inline", freq: 0.6 },
					{ name: "c", strategy: "lazy", freq: 0.3 },
					{ name: "d", strategy: "dead", freq: 0.05 },
				],
				l0_inject_tokens: 100,
			}),
			"utf-8",
		);

		const result = runCrpAudit(tempDir);
		expect(result.inlineCount).toBe(2);
		expect(result.lazyCount).toBe(1);
		expect(result.deadCount).toBe(1);
		expect(result.totalTokens).toBe(100);
	});
});
