import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdAudit } from "../../src/commands/audit";
import { cmdBudget } from "../../src/commands/budget";
import { cmdCheck } from "../../src/commands/check";
import { cmdInit } from "../../src/commands/init";
import { cmdKgSync } from "../../src/commands/kg";
import {
	cmdSkillCreate,
	cmdSkillDelete,
	cmdSkillList,
} from "../../src/commands/skill";
import { runSync } from "../../src/commands/sync";
import { cmdTelemetryStatus } from "../../src/commands/telemetry";
import { cmdValidate } from "../../src/commands/validate";

describe("cmdInit", () => {
	test("creates crp.yaml and skill directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			const exitCode = cmdInit({ skill: "backend", project: "my-project" });
			expect(exitCode).toBe(0);
			expect(existsSync("crp.yaml")).toBe(true);
			expect(existsSync(join(".claude", "skills", "backend"))).toBe(true);
			expect(existsSync(join(".claude", "skills", "shared"))).toBe(true);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("dryRun does not create files", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			const exitCode = cmdInit({ skill: "backend", dryRun: true });
			expect(exitCode).toBe(0);
			expect(existsSync("crp.yaml")).toBe(false);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("fails when crp.yaml exists", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		writeFileSync(join(dir, "crp.yaml"), "version: '1.0'\n");
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			const exitCode = cmdInit({ skill: "backend" });
			expect(exitCode).toBe(1);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("cmdSkillCreate", () => {
	test("creates a new skill and registers in manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdSkillCreate({
				name: "frontend",
				description: "Frontend skill",
			});
			expect(exitCode).toBe(0);
			expect(existsSync(join(".claude", "skills", "frontend"))).toBe(true);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("fails when skill already exists", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend" });
			const exitCode = cmdSkillCreate({ name: "backend" });
			expect(exitCode).toBe(1);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("fails without manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			const exitCode = cmdSkillCreate({ name: "backend" });
			expect(exitCode).toBe(1);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("cmdSkillList", () => {
	test("lists skills from manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend" });
			cmdSkillCreate({ name: "frontend" });
			const exitCode = cmdSkillList();
			expect(exitCode).toBe(0);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("fails without manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			const exitCode = cmdSkillList();
			expect(exitCode).toBe(1);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("cmdSkillDelete", () => {
	test("deletes skill with force flag", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend" });
			const exitCode = cmdSkillDelete({ name: "backend", force: true });
			expect(exitCode).toBe(0);
			expect(existsSync(join(".claude", "skills", "backend"))).toBe(false);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("requires force flag", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend" });
			const exitCode = cmdSkillDelete({ name: "backend" });
			expect(exitCode).toBe(0);
			expect(existsSync(join(".claude", "skills", "backend"))).toBe(true);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runSync", () => {
	test("syncs single-skill project", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = await runSync("backend", "my-project");
			expect(exitCode).toBe(0);
			expect(existsSync(join(".claude", "skills", "SKILL.md"))).toBe(true);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("check mode returns 0 when no changes", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			await runSync("backend", "my-project");
			const exitCode = await runSync("backend", "my-project", true);
			expect(exitCode).toBe(0);
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runCheck", () => {
	test("runs health check on initialized project", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdCheck({ skill: "backend" });
			expect(typeof exitCode).toBe("number");
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runValidate", () => {
	test("validates initialized project", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdValidate();
			expect(typeof exitCode).toBe("number");
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runBudget", () => {
	test("runs budget audit on initialized project", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdBudget({ skill: "backend" });
			expect(typeof exitCode).toBe("number");
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runKg", () => {
	test("generates KG for initialized project", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdKgSync({ skill: "backend" });
			expect(typeof exitCode).toBe("number");
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runAudit", () => {
	test("runs token audit on initialized project", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdAudit({ skill: "backend" });
			expect(typeof exitCode).toBe("number");
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runTelemetry", () => {
	test("returns status without error", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-cmd-"));
		const originalCwd = process.cwd();
		process.chdir(dir);
		try {
			cmdInit({ skill: "backend", project: "my-project" });
			const exitCode = cmdTelemetryStatus();
			expect(typeof exitCode).toBe("number");
		} finally {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
