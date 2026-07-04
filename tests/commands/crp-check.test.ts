import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCrpCheck } from "../../src/commands/crp-check";

describe("crp-check.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-check-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		mkdirSync(join(tempDir, ".crp"), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writeManifest(maxTokens: number) {
		writeFileSync(
			join(tempDir, "crp.yaml"),
			[
				"project:",
				"  name: test",
				"skills: []",
				"crp:",
				"  version: 3",
				"  session_inject:",
				`    max_tokens: ${maxTokens}`,
			].join("\n"),
			"utf-8",
		);
	}

	test("returns 0 when injection fits", () => {
		writeFileSync(
			join(tempDir, ".crp", "routes.json"),
			JSON.stringify({
				version: 3,
				skills: [{ name: "backend", strategy: "inline", freq: 0.8 }],
			}),
			"utf-8",
		);
		writeManifest(300);

		const exitCode = cmdCrpCheck();
		expect(exitCode).toBe(0);
	});

	test("returns 0 on truncation without --ci flag", () => {
		const skills = Array.from({ length: 20 }, (_, i) => ({
			name: `skill-${i}`,
			strategy: "inline" as const,
			freq: 0.9,
			summary: `Very long summary for skill ${i} that takes many tokens to describe`,
		}));

		writeFileSync(
			join(tempDir, ".crp", "routes.json"),
			JSON.stringify({ version: 3, skills }),
			"utf-8",
		);
		writeManifest(50);

		const exitCode = cmdCrpCheck();
		expect(exitCode).toBe(0);
	});

	test("returns 1 on truncation with --ci flag", () => {
		const skills = Array.from({ length: 20 }, (_, i) => ({
			name: `skill-${i}`,
			strategy: "inline" as const,
			freq: 0.9,
			summary: `Very long summary for skill ${i} that takes many tokens to describe`,
		}));

		writeFileSync(
			join(tempDir, ".crp", "routes.json"),
			JSON.stringify({ version: 3, skills }),
			"utf-8",
		);
		writeManifest(50);

		const exitCode = cmdCrpCheck({ ci: true });
		expect(exitCode).toBe(1);
	});

	test("returns 1 when routes.json missing", () => {
		const exitCode = cmdCrpCheck();
		expect(exitCode).toBe(1);
	});
});
