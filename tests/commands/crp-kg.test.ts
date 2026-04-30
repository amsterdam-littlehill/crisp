import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCrpKg } from "../../src/commands/crp-kg";
import { queryKg } from "../../src/lib/crp/kg-index";

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

	test("kg sync generates kg index", () => {
		// Setup skill directory with markdown files
		const skillDir = join(tempDir, ".claude", "skills", "backend");
		const rulesDir = join(skillDir, "rules");
		mkdirSync(rulesDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			"# backend\n\n## Common Tasks\n\n| Task | Must read | Workflow |\n|------|-----------|----------|\n| API | rules/api.md | workflows/api.md |\n",
			"utf-8",
		);
		writeFileSync(
			join(rulesDir, "api.md"),
			"<!-- @summary: API design patterns -->\n\n<!-- @tag: backend -->\n\n# API Rules\n\nDesign patterns for REST APIs.\n",
			"utf-8",
		);

		// Update manifest
		const manifestPath = join(tempDir, "crp.yaml");
		writeFileSync(
			manifestPath,
			`project:\n  name: test\nskills:\n  - name: backend\n    description: backend skill\n`,
			"utf-8",
		);

		const { cmdKgSync } = require("../../src/commands/kg");
		const exitCode = cmdKgSync({ skill: "backend" });
		expect(exitCode).toBe(0);
		expect(existsSync(join(tempDir, ".crp", "kg", "index.json"))).toBe(true);

		// Verify kg query works after sync
		const queryResult = queryKg("backend", 200, tempDir);
		expect(queryResult).toContain("API design patterns");
	});
});
