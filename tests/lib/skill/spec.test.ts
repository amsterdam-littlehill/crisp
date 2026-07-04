import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	SKILL_SPEC,
	type Tier,
	tierForPath,
} from "../../../src/lib/skill/spec";
import { validateSkillAgainstSpec } from "../../../src/lib/skill/validate";

const TEMPLATES_SKILL = join(
	import.meta.dirname,
	"..",
	"..",
	"..",
	"templates",
	"skill",
);

describe("tierForPath", () => {
	test("SKILL.md -> L0", () => {
		expect(tierForPath("SKILL.md")).toBe<Tier>("L0");
	});
	test("_hot-cache.md -> L0", () => {
		expect(tierForPath("_hot-cache.md")).toBe<Tier>("L0");
	});
	test("rules/rule.md -> L1", () => {
		expect(tierForPath("rules/rule.md")).toBe<Tier>("L1");
	});
	test("workflows/fix-bug.md -> L2", () => {
		expect(tierForPath("workflows/fix-bug.md")).toBe<Tier>("L2");
	});
	test("references/ref.md -> L3", () => {
		expect(tierForPath("references/ref.md")).toBe<Tier>("L3");
	});
	test("scripts/foo.sh -> L2 (default — no tierMap match)", () => {
		expect(tierForPath("scripts/foo.sh")).toBe<Tier>("L2");
	});
	test("loose file in skill root -> L2 (default)", () => {
		expect(tierForPath("notes.md")).toBe<Tier>("L2");
	});
	test("case-insensitive basename match for SKILL.md", () => {
		expect(tierForPath("subdir/Skill.MD")).toBe<Tier>("L0");
	});
	test("accepts backslash path rules\\rule.md -> L1", () => {
		expect(tierForPath("rules\\rule.md")).toBe<Tier>("L1");
	});
});

describe("SKILL_SPEC contents", () => {
	test("default tier is L2", () => {
		expect(SKILL_SPEC.defaultTier).toBe("L2");
	});
	test("hot-cache / SKILL.md tier is L0", () => {
		expect(SKILL_SPEC.hotCacheAndSkillMdTier).toBe("L0");
	});
	test("tierMap reproduces the generator's dir-to-tier map", () => {
		const map = Object.fromEntries(
			SKILL_SPEC.tierMap.map((e) => [e.dir, e.tier]),
		);
		expect(map.rules).toBe("L1");
		expect(map.workflows).toBe("L2");
		expect(map.references).toBe("L3");
	});
	test("required SKILL.md sections are Zone-canonical", () => {
		const needles = SKILL_SPEC.requiredSkillMdSections.map((s) => s.needle);
		expect(needles).toEqual(["Common Tasks", "Known Gotchas", "Verification"]);
	});
	test("legacy section names are dropped", () => {
		const needles = SKILL_SPEC.requiredSkillMdSections.map((s) => s.needle);
		expect(needles).not.toContain("Always Read");
		expect(needles).not.toContain("Core Principles");
	});
	test("hooks-directory check is dropped (Q4)", () => {
		const dirs = SKILL_SPEC.requiredDirs.map((d) => d.path);
		expect(dirs).not.toContain(".claude/hooks");
		expect(dirs).not.toContain(".crp/hooks");
	});
	test("commonTasks contract pins the parsing columns", () => {
		expect(SKILL_SPEC.commonTasks.mustReadColumn).toBe(2);
		expect(SKILL_SPEC.commonTasks.workflowColumn).toBe(3);
		expect(SKILL_SPEC.commonTasks.fallbackTokens.length).toBeGreaterThan(0);
	});
});

describe("anti-drift: shipped template validates clean", () => {
	test("templates/skill has ZERO errors against the spec", () => {
		const issues = validateSkillAgainstSpec(TEMPLATES_SKILL);
		const errors = issues.filter((i) => i.severity === "error");
		expect(errors).toEqual([]);
	});
	test("templates/skill structural dirs/files/sections all present", () => {
		const issues = validateSkillAgainstSpec(TEMPLATES_SKILL);
		// No structural codes at all on the shipped template.
		const structural = issues.filter((i) => i.code.startsWith("missing-"));
		expect(structural).toEqual([]);
	});
});
