import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSkillAgainstSpec } from "../../../src/lib/skill/validate";

describe("validateSkillAgainstSpec — Common Tasks refs", () => {
	// The KG generator silently drops a Common Tasks ref whose file is absent
	// (it can't be a node). `crp skill check` must surface that author bug
	// instead, so the edge doesn't vanish without a signal.
	test("warns on Must-read/Workflow refs that don't resolve to a file", () => {
		const dir = mkdtempSync(join(tmpdir(), "crp-validate-"));
		writeFileSync(
			join(dir, "SKILL.md"),
			[
				"# Skill",
				"",
				"## Common Tasks",
				"| Task | Must read | Workflow |",
				"|------|-----------|----------|",
				"| API | rules/api.md | workflows/missing.md |",
				"",
				"## Known Gotchas",
				"",
				"## Verification",
				"",
			].join("\n"),
		);
		mkdirSync(join(dir, "rules"), { recursive: true });
		writeFileSync(join(dir, "rules", "api.md"), "API\n");
		try {
			const issues = validateSkillAgainstSpec(dir);
			// The resolving ref (rules/api.md) is NOT flagged; the missing one is.
			const missing = issues.filter(
				(i) => i.code === "common-tasks-missing-ref",
			);
			expect(missing.length).toBe(1);
			expect(missing[0].message).toContain("workflows/missing.md");
			expect(missing[0].severity).toBe("warn");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("does not warn when all Common Tasks refs resolve", () => {
		const dir = mkdtempSync(join(tmpdir(), "crp-validate-"));
		writeFileSync(
			join(dir, "SKILL.md"),
			[
				"# Skill",
				"",
				"## Common Tasks",
				"| Task | Must read | Workflow |",
				"|------|-----------|----------|",
				"| API | rules/api.md | workflows/fix.md |",
				"",
				"## Known Gotchas",
				"",
				"## Verification",
				"",
			].join("\n"),
		);
		mkdirSync(join(dir, "rules"), { recursive: true });
		writeFileSync(join(dir, "rules", "api.md"), "API\n");
		mkdirSync(join(dir, "workflows"), { recursive: true });
		writeFileSync(join(dir, "workflows", "fix.md"), "Fix\n");
		try {
			const issues = validateSkillAgainstSpec(dir);
			expect(issues.some((i) => i.code === "common-tasks-missing-ref")).toBe(
				false,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
