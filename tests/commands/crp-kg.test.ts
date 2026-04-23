import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCrpKg } from "../../src/commands/crp-kg";

describe("crp-kg.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-kg-cmd-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		mkdirSync(join(tempDir, ".crp", "kg"), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("query returns result for known topic", () => {
		writeFileSync(
			join(tempDir, ".crp", "kg", "index.json"),
			JSON.stringify({
				version: 1,
				generated_at: new Date().toISOString(),
				chunks: [
					{
						id: "c1",
						topics: ["auth"],
						content: "Auth patterns",
						tokens: 3,
						source: "test",
					},
				],
			}),
			"utf-8",
		);

		const exitCode = cmdCrpKg("auth");
		expect(exitCode).toBe(0);
	});
});
