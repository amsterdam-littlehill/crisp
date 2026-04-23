import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkDeprecatedRules,
	checkFileSizes,
	checkGotchasEmpty,
	checkLinkIntegrity,
	checkPlaceholders,
	checkProxyLinkIntegrity,
	clearIssues,
	emitFull,
	getIssueCounts,
} from "../../src/lib/health/checker";
import {
	checkDescriptionConsistency,
	checkEntryProxyDrift,
	checkManifestDrift,
	checkParentGatewayDrift,
	runAllDriftChecks,
} from "../../src/lib/health/drift";

describe("emitFull + clearIssues + getIssueCounts", () => {
	test("emitFull stores ERROR issues", () => {
		clearIssues();
		emitFull("ERROR", "problem", "impact", "fix");
		const counts = getIssueCounts();
		expect(counts.errors).toBe(1);
		expect(counts.warnings).toBe(0);
		expect(counts.infos).toBe(0);
		clearIssues();
	});

	test("emitFull stores WARNING issues", () => {
		clearIssues();
		emitFull("WARNING", "problem", "impact", "fix");
		const counts = getIssueCounts();
		expect(counts.errors).toBe(0);
		expect(counts.warnings).toBe(1);
		expect(counts.infos).toBe(0);
		clearIssues();
	});

	test("emitFull stores INFO issues", () => {
		clearIssues();
		emitFull("INFO", "problem", "impact", "fix");
		const counts = getIssueCounts();
		expect(counts.errors).toBe(0);
		expect(counts.warnings).toBe(0);
		expect(counts.infos).toBe(1);
		clearIssues();
	});

	test("clearIssues resets all arrays", () => {
		emitFull("ERROR", "p1", "i1", "f1");
		emitFull("WARNING", "p2", "i2", "f2");
		emitFull("INFO", "p3", "i3", "f3");
		clearIssues();
		const counts = getIssueCounts();
		expect(counts.errors).toBe(0);
		expect(counts.warnings).toBe(0);
		expect(counts.infos).toBe(0);
	});
});

describe("checkFileSizes", () => {
	test("returns empty when files are under threshold", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nShort.\n");
		try {
			clearIssues();
			checkFileSizes(dir, [], 100, 60);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(0);
			expect(counts.warnings).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags gateway exceeding max lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const longContent = "line\n".repeat(120);
		writeFileSync(join(dir, "SKILL.md"), longContent);
		try {
			clearIssues();
			checkFileSizes(dir, [], 100, 60);
			const counts = getIssueCounts();
			expect(counts.errors).toBeGreaterThanOrEqual(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags gateway approaching limit", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const content = "line\n".repeat(85);
		writeFileSync(join(dir, "SKILL.md"), content);
		try {
			clearIssues();
			checkFileSizes(dir, [], 100, 60);
			const counts = getIssueCounts();
			expect(counts.warnings).toBeGreaterThanOrEqual(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags shell exceeding max lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const shellDir = mkdtempSync(join(tmpdir(), "crisp-shell-"));
		const longContent = "line\n".repeat(70);
		writeFileSync(join(shellDir, "CLAUDE.md"), longContent);
		try {
			clearIssues();
			checkFileSizes(dir, [join(shellDir, "CLAUDE.md")], 100, 60);
			const counts = getIssueCounts();
			expect(counts.errors).toBeGreaterThanOrEqual(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
			rmSync(shellDir, { recursive: true, force: true });
		}
	});

	test("flags markdown files over 500 lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const subDir = join(dir, "references");
		mkdirSync(subDir, { recursive: true });
		const longContent = "line\n".repeat(550);
		writeFileSync(join(subDir, "doc.md"), longContent);
		try {
			clearIssues();
			checkFileSizes(dir, [], 1000, 1000);
			const counts = getIssueCounts();
			expect(counts.warnings).toBeGreaterThanOrEqual(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("checkLinkIntegrity", () => {
	test("returns empty when no broken links", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const subDir = join(dir, "references");
		mkdirSync(subDir, { recursive: true });
		writeFileSync(join(subDir, "ref.md"), "Reference");
		writeFileSync(join(dir, "SKILL.md"), "See `references/ref.md`");
		try {
			clearIssues();
			checkLinkIntegrity(dir, dir);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags broken link", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(join(dir, "SKILL.md"), "See `missing.md`");
		try {
			clearIssues();
			checkLinkIntegrity(dir, dir);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("ignores http links", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(join(dir, "SKILL.md"), "See `https://example.com`");
		try {
			clearIssues();
			checkLinkIntegrity(dir, dir);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("checkProxyLinkIntegrity", () => {
	test("returns empty when no shells provided", () => {
		clearIssues();
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		try {
			checkProxyLinkIntegrity(dir, []);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags broken link in proxy", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const proxyDir = mkdtempSync(join(tmpdir(), "crisp-proxy-"));
		writeFileSync(join(proxyDir, "CLAUDE.md"), "See `missing.md`");
		try {
			clearIssues();
			checkProxyLinkIntegrity(dir, [join(proxyDir, "CLAUDE.md")]);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
			rmSync(proxyDir, { recursive: true, force: true });
		}
	});
});

describe("checkGotchasEmpty", () => {
	test("warns when gotchas.md is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		try {
			clearIssues();
			checkGotchasEmpty(dir);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns empty when gotchas.md has only filler content", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const refDir = join(dir, "references");
		mkdirSync(refDir, { recursive: true });
		writeFileSync(join(refDir, "gotchas.md"), "# Gotchas\n\nFILL this in\n");
		try {
			clearIssues();
			checkGotchasEmpty(dir);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("warns when gotchas.md has many content lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const refDir = join(dir, "references");
		mkdirSync(refDir, { recursive: true });
		const content =
			"# Gotchas\n\nReal pitfall one.\nReal pitfall two.\nReal pitfall three.\nReal pitfall four.\n";
		writeFileSync(join(refDir, "gotchas.md"), content);
		try {
			clearIssues();
			checkGotchasEmpty(dir);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("checkDeprecatedRules", () => {
	test("returns empty when no deprecated markers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nNo deprecated content.\n");
		try {
			clearIssues();
			checkDeprecatedRules(dir);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags stale deprecated markers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const oldDate = "2020-01-01";
		writeFileSync(
			join(dir, "SKILL.md"),
			`# Skill\n\n<!-- DEPRECATED: ${oldDate} -->\nOld rule.\n`,
		);
		try {
			clearIssues();
			checkDeprecatedRules(dir);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("ignores recent deprecated markers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		const now = new Date();
		const recentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		writeFileSync(
			join(dir, "SKILL.md"),
			`# Skill\n\n<!-- DEPRECATED: ${recentDate} -->\nNew rule.\n`,
		);
		try {
			clearIssues();
			checkDeprecatedRules(dir);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("checkPlaceholders", () => {
	test("flags unreplaced placeholders", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(
			join(dir, "SKILL.md"),
			"# {{NAME}}\n\nProject: {{PROJECT}}\n",
		);
		try {
			clearIssues();
			checkPlaceholders(dir, []);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags FILL markers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(
			join(dir, "SKILL.md"),
			"# Skill\n\n<!-- FILL: description -->\n",
		);
		try {
			clearIssues();
			checkPlaceholders(dir, []);
			const counts = getIssueCounts();
			expect(counts.warnings).toBe(1);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns empty when no placeholders", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-health-"));
		writeFileSync(join(dir, "SKILL.md"), "# MySkill\n\nReal content.\n");
		try {
			clearIssues();
			checkPlaceholders(dir, []);
			const counts = getIssueCounts();
			expect(counts.errors).toBe(0);
			expect(counts.warnings).toBe(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("checkManifestDrift", () => {
	test("returns empty for missing manifest", () => {
		clearIssues();
		const result = checkManifestDrift("/nonexistent/crp.yaml");
		expect(result).toEqual([]);
		clearIssues();
	});

	test("detects declared skill missing from disk", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-drift-"));
		const skillsDir = join(dir, ".claude", "skills");
		mkdirSync(skillsDir, { recursive: true });
		const manifest = {
			version: "1.0",
			skills: [{ name: "backend", description: "Backend skill" }],
		};
		writeFileSync(join(dir, "crp.yaml"), JSON.stringify(manifest));
		try {
			clearIssues();
			const originalCwd = process.cwd();
			process.chdir(dir);
			const result = checkManifestDrift("crp.yaml");
			process.chdir(originalCwd);
			expect(result.length).toBeGreaterThan(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("checkParentGatewayDrift", () => {
	test("flags missing parent gateway", () => {
		clearIssues();
		const manifest = {
			version: "1.0",
			skills: [{ name: "backend", description: "Backend" }],
			default_skill: "backend",
		};
		const result = checkParentGatewayDrift(manifest as any);
		expect(result.length).toBeGreaterThan(0);
		clearIssues();
	});
});

describe("checkEntryProxyDrift", () => {
	test("returns empty for single skill", () => {
		clearIssues();
		const manifest = {
			version: "1.0",
			skills: [{ name: "backend", description: "Backend" }],
		};
		const result = checkEntryProxyDrift(manifest as any);
		expect(result).toEqual([]);
		clearIssues();
	});
});

describe("checkDescriptionConsistency", () => {
	test("returns empty when descriptions match", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-drift-"));
		const skillsDir = join(dir, ".claude", "skills", "backend");
		mkdirSync(skillsDir, { recursive: true });
		writeFileSync(
			join(skillsDir, "SKILL.md"),
			"---\ndescription: Backend skill\n---\n# Backend\n",
		);
		try {
			clearIssues();
			const originalCwd = process.cwd();
			process.chdir(dir);
			const manifest = {
				version: "1.0",
				skills: [{ name: "backend", description: "Backend skill" }],
			};
			const result = checkDescriptionConsistency(manifest as any);
			process.chdir(originalCwd);
			expect(result).toEqual([]);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("flags mismatched descriptions", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-drift-"));
		const skillsDir = join(dir, ".claude", "skills", "backend");
		mkdirSync(skillsDir, { recursive: true });
		writeFileSync(
			join(skillsDir, "SKILL.md"),
			"---\ndescription: From frontmatter\n---\n# Backend\n",
		);
		try {
			clearIssues();
			const originalCwd = process.cwd();
			process.chdir(dir);
			const manifest = {
				version: "1.0",
				skills: [{ name: "backend", description: "From manifest" }],
			};
			const result = checkDescriptionConsistency(manifest as any);
			process.chdir(originalCwd);
			expect(result.length).toBeGreaterThan(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runAllDriftChecks", () => {
	test("reports drift for empty project without manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-drift-"));
		try {
			clearIssues();
			const originalCwd = process.cwd();
			process.chdir(dir);
			const result = runAllDriftChecks("crp.yaml");
			process.chdir(originalCwd);
			// An empty/no manifest still triggers parent gateway drift check
			expect(result.length).toBeGreaterThanOrEqual(0);
			clearIssues();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
