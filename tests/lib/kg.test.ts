import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	extractDependencyMarkers,
	extractHotCache,
	extractHotCacheFromDir,
	extractSummary,
	extractTagMarkers,
	generateHotCacheFile,
} from "../../src/lib/kg/extractor";
import { generateKnowledgeGraph, runKgSync } from "../../src/lib/kg/generator";
import type { KnowledgeGraph } from "../../src/lib/kg/validator";
import { validateKg } from "../../src/lib/kg/validator";

describe("extractSummary", () => {
	test("extracts @summary comment", () => {
		const content = "<!-- @summary: This is the summary -->\n# Heading\n";
		expect(extractSummary(content)).toBe("This is the summary");
	});

	test("falls back to first paragraph", () => {
		const content = "# Skill\n\nThis is the description.\n\nMore text.\n";
		expect(extractSummary(content)).toBe("This is the description.");
	});

	test("skips frontmatter", () => {
		const content = "---\ndescription: Test\n---\n\nFirst paragraph here.\n";
		expect(extractSummary(content)).toBe("First paragraph here.");
	});

	test("respects maxLines", () => {
		const content = "Line one.\nLine two.\nLine three.\nLine four.\n";
		expect(extractSummary(content, 2)).toBe("Line one. Line two.");
	});
});

describe("extractHotCache", () => {
	test("returns empty for missing file", () => {
		expect(extractHotCache("/nonexistent/SKILL.md")).toBe("");
	});

	test("extracts content before @hot-cache-end", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		const content =
			"---\ndesc: Test\n---\n\nLine one.\nLine two.\n<!-- @hot-cache-end -->\nHidden.\n";
		writeFileSync(join(dir, "SKILL.md"), content);
		try {
			const cache = extractHotCache(join(dir, "SKILL.md"));
			expect(cache).toContain("Line one.");
			expect(cache).toContain("Line two.");
			expect(cache).not.toContain("Hidden");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("respects maxLines", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
		const content = `---\ndesc: Test\n---\n\n${lines.join("\n")}\n`;
		writeFileSync(join(dir, "SKILL.md"), content);
		try {
			const cache = extractHotCache(join(dir, "SKILL.md"), 10);
			const cacheLines = cache.split("\n");
			expect(cacheLines.length).toBeLessThanOrEqual(10);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("extractHotCacheFromDir", () => {
	test("returns empty for missing directory", () => {
		const result = extractHotCacheFromDir("/nonexistent");
		expect(result).toEqual([]);
	});

	test("extracts from SKILL.md and tagged files", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nCache line.\n");
		writeFileSync(join(dir, "doc.md"), "<!-- @hot-cache -->\nFile cache.\n");
		try {
			const caches = extractHotCacheFromDir(dir);
			expect(caches.length).toBe(2);
			expect(caches[0]).toContain("Cache line.");
			expect(caches[1]).toContain("File cache.");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("ignores files without hot-cache marker", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nCache.\n");
		writeFileSync(join(dir, "other.md"), "No marker here.\n");
		try {
			const caches = extractHotCacheFromDir(dir);
			expect(caches.length).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("generateHotCacheFile", () => {
	test("creates _hot-cache.md", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(join(dir, "SKILL.md"), "# Skill\n\nContent.\n");
		try {
			const path = generateHotCacheFile(dir, 50);
			expect(existsSync(path)).toBe(true);
			const content = readFileSync(path, "utf-8");
			expect(content).toContain("@hot-cache");
			expect(content).toContain("DO NOT EDIT");
			rmSync(path, { force: true });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("extractDependencyMarkers", () => {
	test("returns empty when no markers", () => {
		expect(extractDependencyMarkers("No deps here.")).toEqual([]);
	});

	test("extracts hard dependency", () => {
		const content = "<!-- @depends-on: rules/base hard -->";
		const deps = extractDependencyMarkers(content);
		expect(deps.length).toBe(1);
		expect(deps[0].id).toBe("rules/base");
		expect(deps[0].strength).toBe("hard");
	});

	test("extracts soft dependency by default", () => {
		const content = "<!-- @depends-on: rules/other -->";
		const deps = extractDependencyMarkers(content);
		expect(deps.length).toBe(1);
		expect(deps[0].strength).toBe("soft");
	});

	test("extracts multiple markers", () => {
		const content = `
<!-- @depends-on: a hard -->
<!-- @depends-on: b -->
`;
		const deps = extractDependencyMarkers(content);
		expect(deps.length).toBe(2);
	});
});

describe("extractTagMarkers", () => {
	test("returns empty when no markers", () => {
		expect(extractTagMarkers("No tags.")).toEqual([]);
	});

	test("extracts tag with default confidence", () => {
		const content = "<!-- @tag: backend -->";
		const tags = extractTagMarkers(content);
		expect(tags.length).toBe(1);
		expect(tags[0].name).toBe("backend");
		expect(tags[0].confidence).toBe(1.0);
	});

	test("extracts tag with custom confidence", () => {
		const content = "<!-- @tag: api 0.85 -->";
		const tags = extractTagMarkers(content);
		expect(tags.length).toBe(1);
		expect(tags[0].name).toBe("api");
		expect(tags[0].confidence).toBe(0.85);
	});
});

describe("validateKg", () => {
	test("returns empty for valid graph", () => {
		const kg: KnowledgeGraph = {
			project: "test",
			generated_at: "2024-01-01T00:00:00Z",
			nodes: {
				files: [
					{
						id: "f1",
						path: "a.md",
						skill: "s1",
						tier: "L0",
						token_count: 10,
						content_hash: "abc",
						summary: "summary",
					},
				],
				task_types: [
					{ id: "t1", keywords: ["a"], description: "desc", category: "cat" },
				],
				tags: [{ id: "tag:x", name: "x", category: "domain" }],
			},
			edges: [{ from: "f1", to: "t1", type: "REQUIRES" }],
		};
		expect(validateKg(kg)).toEqual([]);
	});

	test("flags non-dictionary input", () => {
		expect(validateKg(null)).toContain("KG must be a dictionary");
		expect(validateKg([])).toContain("KG must be a dictionary");
		expect(validateKg("string")).toContain("KG must be a dictionary");
	});

	test("flags missing project", () => {
		const kg = { nodes: { files: [], task_types: [], tags: [] }, edges: [] };
		expect(validateKg(kg)).toContain("Missing required field: project");
	});

	test("flags invalid nodes", () => {
		const kg = { project: "test", nodes: "bad", edges: [] };
		expect(validateKg(kg)).toContain("nodes must be a dictionary");
	});

	test("flags invalid node lists", () => {
		const kg = {
			project: "test",
			nodes: { files: "bad", task_types: [], tags: [] },
			edges: [],
		};
		expect(validateKg(kg)).toContain("nodes.files must be a list");
	});

	test("flags node missing id", () => {
		const kg = {
			project: "test",
			nodes: { files: [{ path: "a.md" } as any], task_types: [], tags: [] },
			edges: [],
		};
		expect(validateKg(kg)).toContain("Node missing id in files");
	});

	test("flags invalid edges", () => {
		const kg = {
			project: "test",
			nodes: { files: [], task_types: [], tags: [] },
			edges: "bad",
		};
		expect(validateKg(kg)).toContain("edges must be a list");
	});

	test("flags edge referencing nonexistent node", () => {
		const kg: KnowledgeGraph = {
			project: "test",
			generated_at: "2024-01-01T00:00:00Z",
			nodes: {
				files: [
					{
						id: "f1",
						path: "a.md",
						skill: "s1",
						tier: "L0",
						token_count: 10,
						content_hash: "abc",
						summary: "summary",
					},
				],
				task_types: [],
				tags: [],
			},
			edges: [{ from: "f1", to: "missing", type: "REQUIRES" }],
		};
		expect(validateKg(kg)).toContain(
			"edges[0] 'to' references nonexistent node: missing",
		);
	});
});

describe("generateKnowledgeGraph", () => {
	test("generates graph for skill directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(join(dir, "SKILL.md"), "# Backend\n\nBackend skill.\n");
		mkdirSync(join(dir, "rules"), { recursive: true });
		writeFileSync(
			join(dir, "rules", "rule.md"),
			"# Rule\n\n<!-- @tag: backend -->\n",
		);
		try {
			const manifest = {
				project: { name: "test" },
				skills: [{ name: "backend" }],
			} as any;
			const kg = generateKnowledgeGraph(dir, manifest);
			expect(kg.project).toBe("test");
			expect(kg.nodes.files.length).toBeGreaterThan(0);
			expect(kg.generated_at).toBeTruthy();
			const errors = validateKg(kg);
			expect(errors).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("infers correct tiers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(join(dir, "SKILL.md"), "# Backend\n");
		writeFileSync(join(dir, "_hot-cache.md"), "Cache\n");
		mkdirSync(join(dir, "rules"), { recursive: true });
		writeFileSync(join(dir, "rules", "rule.md"), "Rule\n");
		mkdirSync(join(dir, "references"), { recursive: true });
		writeFileSync(join(dir, "references", "ref.md"), "Ref\n");
		try {
			const manifest = { project: { name: "test" } } as any;
			const kg = generateKnowledgeGraph(dir, manifest);
			const skillFile = kg.nodes.files.find((f) => f.id === "SKILL");
			const rulesFile = kg.nodes.files.find((f) => f.id === "rules/rule");
			const refFile = kg.nodes.files.find((f) => f.id === "references/ref");
			expect(skillFile?.tier).toBe("L0");
			expect(rulesFile?.tier).toBe("L1");
			expect(refFile?.tier).toBe("L3");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("extracts dependencies from markers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(
			join(dir, "SKILL.md"),
			"# Backend\n\n<!-- @depends-on: rules/base hard -->\n",
		);
		mkdirSync(join(dir, "rules"), { recursive: true });
		writeFileSync(join(dir, "rules", "base.md"), "Base\n");
		try {
			const manifest = { project: { name: "test" } } as any;
			const kg = generateKnowledgeGraph(dir, manifest);
			const depEdge = kg.edges.find((e) => e.type === "DEPENDS_ON");
			expect(depEdge).toBeDefined();
			expect(depEdge?.to).toBe("rules/base");
			expect(depEdge?.strength).toBe("hard");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("extracts tags from markers", () => {
		const dir = mkdtempSync(join(tmpdir(), "crisp-kg-"));
		writeFileSync(join(dir, "SKILL.md"), "# Backend\n\n<!-- @tag: api -->\n");
		try {
			const manifest = { project: { name: "test" } } as any;
			const kg = generateKnowledgeGraph(dir, manifest);
			expect(kg.nodes.tags.some((t) => t.name === "api")).toBe(true);
			expect(
				kg.edges.some((e) => e.type === "HAS_TAG" && e.to === "tag:api"),
			).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("runKgSync", () => {
	test("returns 0 and warns for missing skill directory", () => {
		const manifest = {
			project: { name: "test" },
			skills: [{ name: "missing" }],
		} as any;
		const result = runKgSync("missing", ".claude/skills", manifest);
		// Missing directories are skipped with a warning, not a hard failure
		expect(result).toBe(0);
	});
});
