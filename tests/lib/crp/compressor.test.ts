import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compressSkill } from "../../../src/lib/crp/compressor";

describe("compressor.ts", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-compressor-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("returns empty for missing file", () => {
		const result = compressSkill(join(tempDir, "missing.md"));
		expect(result.summary).toBe("");
		expect(result.tokens).toBe(0);
	});

	test("extracts bullet points", () => {
		const path = join(tempDir, "SKILL.md");
		writeFileSync(
			path,
			[
				"# Skill",
				"",
				"- Use TypeScript strict mode",
				"- Prefer immutable updates",
				"- Handle errors explicitly",
			].join("\n"),
			"utf-8",
		);

		const result = compressSkill(path);
		expect(result.summary).toContain("TypeScript strict mode");
		expect(result.summary).toContain("immutable updates");
		expect(result.summary).toContain("Handle errors");
	});

	test("prioritizes trigger phrases", () => {
		const path = join(tempDir, "SKILL.md");
		writeFileSync(
			path,
			[
				"# Skill",
				"",
				"- Use TypeScript strict mode",
				"- When deploying, run smoke tests first",
				"- Prefer immutable updates",
				"- If API fails, retry with backoff",
				"- Handle errors explicitly",
			].join("\n"),
			"utf-8",
		);

		const result = compressSkill(path);
		// Should include trigger phrases first
		expect(result.summary).toContain("When deploying");
		expect(result.summary).toContain("If API fails");
	});

	test("limits to 3 items", () => {
		const path = join(tempDir, "SKILL.md");
		writeFileSync(
			path,
			[
				"# Skill",
				"",
				"- Item 1",
				"- Item 2",
				"- Item 3",
				"- Item 4",
				"- Item 5",
			].join("\n"),
			"utf-8",
		);

		const result = compressSkill(path);
		const parts = result.summary.split("; ");
		expect(parts.length).toBeLessThanOrEqual(3);
	});

	test("falls back to plain text when no bullets", () => {
		const path = join(tempDir, "SKILL.md");
		writeFileSync(
			path,
			[
				"# Skill",
				"",
				"This is a plain text description without any bullet points.",
				"It should still produce a summary.",
			].join("\n"),
			"utf-8",
		);

		const result = compressSkill(path);
		expect(result.summary.length).toBeGreaterThan(0);
	});
});
