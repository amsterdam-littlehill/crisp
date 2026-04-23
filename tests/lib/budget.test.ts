import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	auditDescriptionLength,
	auditDuplicateContent,
	auditEntryProxySize,
	auditGatewaySize,
	auditMcpToolCount,
	auditRulesBlot,
	runBudgetAudit,
} from "../../src/lib/budget/analyzer";

describe("auditGatewaySize", () => {
	test("returns empty for missing skill dir", () => {
		const findings = auditGatewaySize("/nonexistent/skill", 1000);
		expect(findings).toEqual([]);
	});

	test("returns empty when under threshold", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-budget-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nShort intro.\n");
		try {
			const findings = auditGatewaySize(dir, 1000);
			expect(findings).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags when gateway exceeds threshold", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-budget-"));
		const longContent = "word ".repeat(500); // ~500 words, ~125 chars estimate
		writeFileSync(join(dir, "_hot-cache.md"), longContent);
		try {
			const findings = auditGatewaySize(dir, 10);
			expect(findings.length).toBe(1);
			expect(findings[0].dimension).toBe("gateway_size");
			expect(findings[0].severity).toBe("WARNING");
			expect(findings[0].current_value).toBeGreaterThan(10);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("auditEntryProxySize", () => {
	test("returns empty when no proxies exist", () => {
		const findings = auditEntryProxySize("/nonexistent", 200);
		expect(findings).toEqual([]);
	});

	test("flags oversized proxy", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-proxy-"));
		mkdirSync(join(dir, ".claude"), { recursive: true });
		const longContent = "word ".repeat(300); // ~75 chars estimate
		writeFileSync(join(dir, ".claude", "CLAUDE.md"), longContent);
		try {
			const findings = auditEntryProxySize(dir, 10);
			expect(findings.length).toBe(1);
			expect(findings[0].dimension).toBe("entry_proxy_size");
			expect(findings[0].current_value).toBeGreaterThan(10);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("auditDescriptionLength", () => {
	test("returns empty for missing file", () => {
		const findings = auditDescriptionLength("/nonexistent/SKILL.md", 30);
		expect(findings).toEqual([]);
	});

	test("returns empty for short description", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-desc-"));
		const content = `---\ndescription: Short desc\n---\n# Skill\n`;
		const path = join(dir, "SKILL.md");
		writeFileSync(path, content);
		try {
			const findings = auditDescriptionLength(path, 30);
			expect(findings).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags long description", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-desc-"));
		const longDesc = "word ".repeat(20); // 20 words
		const content = `---\ndescription: ${longDesc}\n---\n# Skill\n`;
		const path = join(dir, "SKILL.md");
		writeFileSync(path, content);
		try {
			const findings = auditDescriptionLength(path, 10);
			expect(findings.length).toBe(1);
			expect(findings[0].dimension).toBe("description_length");
			expect(findings[0].current_value).toBeGreaterThan(10);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("auditDuplicateContent", () => {
	test("returns empty when no duplicates", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-dup-"));
		writeFileSync(join(dir, "a.md"), "Content A");
		writeFileSync(join(dir, "b.md"), "Content B");
		try {
			const findings = auditDuplicateContent(dir);
			expect(findings).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags duplicate content", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-dup-"));
		writeFileSync(join(dir, "a.md"), "Same content");
		writeFileSync(join(dir, "b.md"), "Same content");
		try {
			const findings = auditDuplicateContent(dir);
			expect(findings.length).toBe(1);
			expect(findings[0].dimension).toBe("duplicate_content");
			expect(findings[0].severity).toBe("INFO");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("auditRulesBlot", () => {
	test("returns empty when no rules dir", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-rules-"));
		try {
			const findings = auditRulesBlot(dir, 3000);
			expect(findings).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags when rules exceed threshold", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-rules-"));
		const rulesDir = join(dir, "rules");
		mkdirSync(rulesDir, { recursive: true });
		const longContent = "word ".repeat(400); // ~100 chars estimate
		writeFileSync(join(rulesDir, "rule.md"), longContent);
		try {
			const findings = auditRulesBlot(dir, 10);
			expect(findings.length).toBe(1);
			expect(findings[0].dimension).toBe("rules_bloat");
			expect(findings[0].current_value).toBeGreaterThan(10);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("auditMcpToolCount", () => {
	test("returns empty when no settings file", () => {
		const findings = auditMcpToolCount("/nonexistent/settings.json");
		expect(findings).toEqual([]);
	});

	test("returns empty when under threshold", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-mcp-"));
		const settings = { mcpServers: { a: { tools: [1, 2, 3] } } };
		writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
		try {
			const findings = auditMcpToolCount(join(dir, "settings.json"));
			expect(findings).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags when tool count exceeds threshold", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-mcp-"));
		const tools = Array.from({ length: 90 }, (_, i) => i);
		const settings = { mcpServers: { a: { tools } } };
		writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
		try {
			const findings = auditMcpToolCount(join(dir, "settings.json"));
			expect(findings.length).toBe(1);
			expect(findings[0].dimension).toBe("mcp_tool_count");
			expect(findings[0].severity).toBe("INFO");
			expect(findings[0].current_value).toBe(90);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("defaults to 10 tools when tools array is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-mcp-"));
		const settings = { mcpServers: { a: {} } };
		writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
		try {
			const findings = auditMcpToolCount(join(dir, "settings.json"));
			// 10 tools from default, under 80 threshold
			expect(findings).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runBudgetAudit", () => {
	test("returns empty findings for empty project", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		try {
			const result = runBudgetAudit(dir);
			expect(result.findings).toEqual([]);
			expect(result.total_tokens).toBe(0);
			expect(result.summary).toEqual({ warnings: 0, infos: 0, notes: 0 });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("finds issues in real project structure", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-audit-"));
		const skillsDir = join(dir, ".claude", "skills");
		const skillDir = join(skillsDir, "test-skill");
		mkdirSync(skillDir, { recursive: true });
		mkdirSync(join(skillDir, "rules"), { recursive: true });

		const longContent = "word ".repeat(500);
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---\ndescription: ${longContent}\n---\n# Skill\n${longContent}`,
		);
		writeFileSync(join(skillDir, "rules", "rule.md"), longContent);
		writeFileSync(join(skillDir, "_hot-cache.md"), longContent);

		try {
			const result = runBudgetAudit(dir, {
				max_gateway_tokens: 10,
				max_rules_bloat_tokens: 10,
			});
			const warnings = (result.summary as Record<string, number>).warnings;
			expect(warnings).toBeGreaterThan(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
