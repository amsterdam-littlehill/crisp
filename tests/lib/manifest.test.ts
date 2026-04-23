import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultManifest } from "../../src/lib/manifest/defaults";
import { extractSkillFrontmatter } from "../../src/lib/manifest/frontmatter";
import { loadManifest, saveManifest } from "../../src/lib/manifest/io";
import type { CrpManifest } from "../../src/lib/manifest/types";
import { validateManifest } from "../../src/lib/manifest/validate";

describe("loadManifest", () => {
	test("missing file returns empty object", () => {
		const result = loadManifest("/nonexistent/crp.yaml");
		expect(result).toEqual({});
	});

	test("loads valid YAML", async () => {
		const dir = join(tmpdir(), `crisp-test-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		const path = join(dir, "crp.yaml");
		await writeFile(path, "version: '1.1'\nproject:\n  name: test\n");
		try {
			const result = loadManifest(path);
			expect(result.project?.name).toBe("test");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("saveManifest", () => {
	test("round-trip preserves data", async () => {
		const dir = join(tmpdir(), `crisp-test-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		const path = join(dir, "crp.yaml");
		const data: CrpManifest = {
			project: { name: "round-trip", description: "test" },
			skills: [{ name: "backend", description: "API" }],
		};
		try {
			saveManifest(path, data);
			const loaded = loadManifest(path);
			expect(loaded.project?.name).toBe("round-trip");
			expect(loaded.skills?.[0].name).toBe("backend");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("validateManifest", () => {
	test("valid manifest returns no errors", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [{ name: "backend" }],
			default_skill: "backend",
		};
		expect(validateManifest(data)).toEqual([]);
	});

	test("duplicate skill names", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [{ name: "backend" }, { name: "backend" }],
		};
		const errors = validateManifest(data);
		expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
	});

	test("default_skill not found", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [{ name: "backend" }],
			default_skill: "frontend",
		};
		const errors = validateManifest(data);
		expect(errors.some((e) => e.includes("default_skill"))).toBe(true);
	});

	test("invalid checks values", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [],
			checks: { max_gateway_lines: -10 },
		};
		const errors = validateManifest(data);
		expect(errors.some((e) => e.includes("max_gateway_lines"))).toBe(true);
	});

	test("invalid audit use_tiktoken", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [],
			audit: { use_tiktoken: "yes" as unknown as boolean },
		};
		const errors = validateManifest(data);
		expect(errors.some((e) => e.includes("use_tiktoken"))).toBe(true);
	});
});

describe("validateManifest KG config", () => {
	test("valid KG config returns no errors", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [],
			knowledge_graph: {
				enabled: true,
				max_tokens_execution: 1500,
				max_tokens_synthesis: 800,
			},
		};
		expect(validateManifest(data)).toEqual([]);
	});

	test("invalid enabled type", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [],
			knowledge_graph: { enabled: "yes" as unknown as boolean },
		};
		const errors = validateManifest(data);
		expect(
			errors.some((e) => e.includes("enabled") && e.includes("boolean")),
		).toBe(true);
	});

	test("invalid token value", () => {
		const data: Partial<CrpManifest> = {
			project: { name: "test" },
			skills: [],
			knowledge_graph: { max_tokens_execution: -100 },
		};
		const errors = validateManifest(data);
		expect(errors.some((e) => e.includes("max_tokens_execution"))).toBe(true);
	});
});

describe("extractSkillFrontmatter", () => {
	test("extracts name and description", async () => {
		const dir = join(tmpdir(), `crisp-test-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		const skillDir = join(dir, "backend");
		await mkdir(skillDir, { recursive: true });
		const frontmatter =
			"---\nname: backend\ndescription: API work\nprimary: true\n---\n\n# Content";
		await writeFile(join(skillDir, "SKILL.md"), frontmatter);
		try {
			const result = extractSkillFrontmatter(skillDir);
			expect(result.name).toBe("backend");
			expect(result.description).toBe("API work");
			expect(result.primary).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("missing file returns empty", () => {
		const result = extractSkillFrontmatter("/nonexistent/skill");
		expect(result).toEqual({});
	});

	test("no frontmatter returns empty", async () => {
		const dir = join(tmpdir(), `crisp-test-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		const skillDir = join(dir, "skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "# No frontmatter\n");
		try {
			const result = extractSkillFrontmatter(skillDir);
			expect(result).toEqual({});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("defaultManifest", () => {
	test("has expected structure", () => {
		const manifest = defaultManifest("my-project");
		expect(manifest.project.name).toBe("my-project");
		expect(manifest.skills).toEqual([]);
		expect(manifest.checks?.max_gateway_lines).toBe(100);
		expect(manifest.checks?.max_proxy_lines).toBe(60);
		expect(manifest.audit?.use_tiktoken).toBe(true);
	});
});
