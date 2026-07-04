import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdSkillCheck } from "../../src/commands/skill-check";

describe("cmdSkillCheck", () => {
	let originalCwd: string;
	let tempDir: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = mkdtempSync(join(tmpdir(), "crp-skill-check-"));
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function skillRoot(name: string): string {
		return join(tempDir, ".claude", "skills", name);
	}

	/** Build a skill that satisfies every error-level spec check. */
	function makeValidSkill(name: string): string {
		const dir = skillRoot(name);
		mkdirSync(join(dir, "rules"), { recursive: true });
		mkdirSync(join(dir, "workflows"), { recursive: true });
		mkdirSync(join(dir, "references"), { recursive: true });
		mkdirSync(join(dir, "scripts"), { recursive: true });
		writeFileSync(join(dir, "rules", "project-rules.md"), "# Rules\n");
		writeFileSync(join(dir, "rules", "coding-standards.md"), "# Standards\n");
		writeFileSync(join(dir, "workflows", "fix-bug.md"), "# Fix\n");
		writeFileSync(join(dir, "workflows", "add-feature.md"), "# Add\n");
		writeFileSync(join(dir, "workflows", "update-rules.md"), "# Update\n");
		writeFileSync(join(dir, "references", "gotchas.md"), "# Gotchas\n");
		writeFileSync(join(dir, "scripts", "test-trigger.sh"), "#!/bin/sh\n");
		writeFileSync(
			join(dir, "SKILL.md"),
			`# ${name}\n\n## Common Tasks\n\n## Known Gotchas\n\n## Verification\n`,
		);
		return dir;
	}

	test("valid skill returns 0", () => {
		makeValidSkill("good");
		expect(cmdSkillCheck("good")).toBe(0);
	});

	test("missing required dir returns 1", () => {
		const dir = makeValidSkill("no-rules");
		rmSync(join(dir, "rules"), { recursive: true, force: true });
		expect(cmdSkillCheck("no-rules")).toBe(1);
	});

	test("missing required file returns 1", () => {
		const dir = makeValidSkill("no-gotchas");
		rmSync(join(dir, "references", "gotchas.md"), { force: true });
		expect(cmdSkillCheck("no-gotchas")).toBe(1);
	});

	test("missing required SKILL.md section returns 1", () => {
		const dir = makeValidSkill("no-section");
		writeFileSync(
			join(dir, "SKILL.md"),
			"# Bad\n\n## Common Tasks\n\n## Known Gotchas\n",
		);
		expect(cmdSkillCheck("no-section")).toBe(1);
	});

	test("skill not found returns 1", () => {
		expect(cmdSkillCheck("nonexistent")).toBe(1);
	});

	test("missing name returns 1", () => {
		expect(cmdSkillCheck("")).toBe(1);
	});

	test("--json output shape for valid skill", () => {
		makeValidSkill("jsonok");
		const out = captureLog(() => cmdSkillCheck("jsonok", { json: true }));
		const parsed = JSON.parse(out);
		expect(parsed.name).toBe("jsonok");
		expect(parsed.valid).toBe(true);
		expect(Array.isArray(parsed.issues)).toBe(true);
	});

	test("--json output shape for invalid skill (exit 1, valid=false)", () => {
		const dir = makeValidSkill("jsonbad");
		rmSync(join(dir, "workflows"), { recursive: true, force: true });
		const out = captureLog(() => cmdSkillCheck("jsonbad", { json: true }));
		const parsed = JSON.parse(out);
		expect(parsed.valid).toBe(false);
		expect(parsed.issues.some((i: Issue) => i.severity === "error")).toBe(true);
	});
});

interface Issue {
	severity: string;
	code: string;
	message: string;
}

/** Capture console.log output as a string. */
function captureLog(fn: () => number): string {
	const original = console.log;
	let captured = "";
	console.log = (s: string) => {
		captured += s;
	};
	try {
		fn();
	} finally {
		console.log = original;
	}
	return captured;
}
