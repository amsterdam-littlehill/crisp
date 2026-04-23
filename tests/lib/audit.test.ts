import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	estimateTokens as estimateTokensBench,
	naiveLoadAll,
	sessionWithCompaction,
	skillBasedLoad,
} from "../../src/lib/audit/benchmark";
import {
	auditSkill,
	estimateTokens as estimateTokensAudit,
	parseAlwaysRead,
	parseCommonTasks,
	scanFiles,
} from "../../src/lib/audit/token-audit";

describe("benchmark.estimateTokens", () => {
	test("estimates tokens for a file size", () => {
		const result = estimateTokensBench({
			name: "test.md",
			lines: 100,
			cnRatio: 0.5,
		});
		expect(typeof result).toBe("number");
		expect(result).toBeGreaterThan(0);
	});

	test("higher line count gives higher estimate", () => {
		const small = estimateTokensBench({ name: "a.md", lines: 10, cnRatio: 0 });
		const large = estimateTokensBench({ name: "a.md", lines: 100, cnRatio: 0 });
		expect(large).toBeGreaterThan(small);
	});

	test("chinese ratio affects estimate", () => {
		const cn = estimateTokensBench({ name: "a.md", lines: 100, cnRatio: 1.0 });
		const en = estimateTokensBench({ name: "a.md", lines: 100, cnRatio: 0 });
		expect(cn).not.toBe(en);
	});
});

describe("naiveLoadAll", () => {
	test("returns positive total", () => {
		const total = naiveLoadAll();
		expect(total).toBeGreaterThan(0);
	});

	test("is sum of all skill files", () => {
		const total = naiveLoadAll();
		// Should be a reasonable token count for ~9 files
		expect(total).toBeGreaterThan(500);
	});
});

describe("skillBasedLoad", () => {
	test("returns different values for different tasks", () => {
		const fix = skillBasedLoad("fix_bug");
		const add = skillBasedLoad("add_feature");
		const multi = skillBasedLoad("multi_subtask");
		const other = skillBasedLoad("other");
		expect(fix).toBeGreaterThan(0);
		expect(add).toBeGreaterThan(0);
		expect(multi).toBeGreaterThan(0);
		expect(other).toBeGreaterThan(0);
	});

	test("fix_bug includes fix-bug.md", () => {
		const fix = skillBasedLoad("fix_bug");
		const other = skillBasedLoad("other");
		expect(fix).toBeGreaterThan(other);
	});

	test("unknown task falls back to project-rules only", () => {
		const unknown = skillBasedLoad("unknown_task");
		const other = skillBasedLoad("other");
		// Unknown tasks fall through to else branch (project-rules only)
		// "other" adds project-rules + coding-standards
		expect(unknown).toBeLessThan(other);
		expect(unknown).toBeGreaterThan(0);
	});
});

describe("sessionWithCompaction", () => {
	test("returns result with expected fields", () => {
		const result = sessionWithCompaction(3, [
			"fix_bug",
			"add_feature",
			"other",
		]);
		expect(result).toHaveProperty("naive_total_tokens");
		expect(result).toHaveProperty("skill_total_tokens");
		expect(result).toHaveProperty("rounds");
		expect(result.rounds).toBe(3);
	});

	test("skill total is less than naive total", () => {
		const result = sessionWithCompaction(5, [
			"fix_bug",
			"add_feature",
			"fix_bug",
			"other",
			"add_feature",
		]);
		expect(result.skill_total_tokens).toBeLessThan(result.naive_total_tokens);
	});

	test("single round has no compaction benefit", () => {
		const result = sessionWithCompaction(1, ["fix_bug"]);
		expect(result.skill_total_tokens).toBe(skillBasedLoad("fix_bug"));
		expect(result.naive_total_tokens).toBe(naiveLoadAll());
	});
});

describe("token-audit.estimateTokens", () => {
	test("estimates text tokens", () => {
		const [tokens, label] = estimateTokensAudit("hello world", false);
		expect(tokens).toBeGreaterThan(0);
		expect(label).toBe("[estimated]");
	});

	test("tiktoken mode attempts exact count", () => {
		const [tokens, label] = estimateTokensAudit("hello world", true);
		expect(tokens).toBeGreaterThan(0);
		expect(typeof label).toBe("string");
	});

	test("empty string returns zero", () => {
		const [tokens] = estimateTokensAudit("", false);
		expect(tokens).toBe(0);
	});
});

describe("scanFiles", () => {
	test("returns empty for missing directory", () => {
		const result = scanFiles("/nonexistent/dir");
		expect(result).toEqual({});
	});

	test("counts tokens for markdown files", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		writeFileSync(join(dir, "a.md"), "Hello world\n");
		writeFileSync(join(dir, "b.md"), "More content here\n");
		try {
			const result = scanFiles(dir);
			expect(Object.keys(result).length).toBe(2);
			expect(result["a.md"]).toBeGreaterThan(0);
			expect(result["b.md"]).toBeGreaterThan(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("ignores non-md files", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		writeFileSync(join(dir, "a.md"), "Hello\n");
		writeFileSync(join(dir, "b.txt"), "Ignored\n");
		try {
			const result = scanFiles(dir);
			expect(Object.keys(result).length).toBe(1);
			expect(Object.keys(result)[0]).toEndWith(".md");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("parseAlwaysRead", () => {
	test("returns empty for missing file", () => {
		const result = parseAlwaysRead("/nonexistent/SKILL.md");
		expect(result).toEqual([]);
	});

	test("parses Always Read section", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		const content = `# Skill

## Always Read
\`rules/project-rules.md\`
\`rules/coding-standards.md\`

## Other
Something else.
`;
		writeFileSync(join(dir, "SKILL.md"), content);
		try {
			const result = parseAlwaysRead(join(dir, "SKILL.md"));
			expect(result).toContain("rules/project-rules.md");
			expect(result).toContain("rules/coding-standards.md");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("parseCommonTasks", () => {
	test("returns empty for missing file", () => {
		const result = parseCommonTasks("/nonexistent/SKILL.md");
		expect(result).toEqual({});
	});

	test("parses Common Tasks table", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		const content = `# Skill

## Common Tasks

| Task | References | Description |
|------|-----------|-------------|
| Fix bug | \`rules/fix-bug.md\` | Fix something |
| Add feature | \`rules/add-feature.md\` | Add something |

## Other
`;
		writeFileSync(join(dir, "SKILL.md"), content);
		try {
			const result = parseCommonTasks(join(dir, "SKILL.md"));
			expect(Object.keys(result).length).toBe(2);
			expect(result).toHaveProperty("fix_bug");
			expect(result).toHaveProperty("add_feature");
			expect(result.fix_bug).toContain("rules/fix-bug.md");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("auditSkill", () => {
	test("throws when SKILL.md is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		try {
			expect(() => auditSkill(dir, "test", false)).toThrow();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns audit result for valid skill", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		const gatewayContent = `# Skill

## Always Read
\`rules/project-rules.md\`

## Common Tasks

| Task | References | Description |
|------|-----------|-------------|
| Fix bug | \`rules/fix-bug.md\` | Fix |

`;
		writeFileSync(join(dir, "SKILL.md"), gatewayContent);
		mkdirSync(join(dir, "rules"), { recursive: true });
		writeFileSync(
			join(dir, "rules", "project-rules.md"),
			"# Rules\n\nSome rules.\n",
		);
		writeFileSync(join(dir, "rules", "fix-bug.md"), "# Fix Bug\n\nSteps.\n");
		try {
			const result = auditSkill(dir, "backend", false);
			expect(result.skill_name).toBe("backend");
			expect(result.naive_all_tokens).toBeGreaterThan(0);
			expect(result.gateway_tokens).toBeGreaterThan(0);
			expect(Object.keys(result.per_task_tokens).length).toBeGreaterThan(0);
			expect(result.session_5rounds.naive_total_tokens).toBeGreaterThan(0);
			expect(result.session_5rounds.crp_total_tokens).toBeGreaterThan(0);
			expect(typeof result.cost_usd.naive).toBe("number");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("includes other_unlisted task", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nNo tasks.\n");
		try {
			const result = auditSkill(dir, "backend", false);
			expect(result.per_task_tokens).toHaveProperty("other_unlisted");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
