import { describe, expect, test } from "bun:test";
import type { CrpManifest } from "../src/lib/manifest/types";
import { validateManifest } from "../src/lib/manifest/validate";

function makeCrp(tiers: {
	inline_threshold?: number;
	hint_threshold?: number;
}) {
	return {
		version: 3 as const,
		session_inject: { max_tokens: 300, include_kg_index: false },
		tiers: { inline_threshold: 0.5, hint_threshold: 0.1, ...tiers },
		telemetry: { window_days: 7 },
		kg: { max_query_tokens: 100, index_inline_tokens: 50 },
	};
}

describe("validateManifest", () => {
	test("valid manifest returns empty array", () => {
		const manifest = {
			project: { name: "test-project" },
			skills: [{ name: "skill-a" }, { name: "skill-b" }],
			default_skill: "skill-a",
			checks: { max_gateway_lines: 100 },
			crp: makeCrp({}),
		};
		const errors = validateManifest(manifest);
		expect(errors).toEqual([]);
	});

	test("missing project.name errors", () => {
		const manifest = {
			project: {},
			skills: [],
		} as unknown as Partial<CrpManifest>;
		const errors = validateManifest(manifest);
		expect(errors).toContain("project.name is required");
	});

	test("skills not array errors", () => {
		const manifest = {
			project: { name: "test" },
			skills: "not-array",
		} as unknown as Partial<CrpManifest>;
		const errors = validateManifest(manifest);
		expect(errors).toContain("skills must be a list");
	});

	test("duplicate skill name errors", () => {
		const manifest = {
			project: { name: "test" },
			skills: [{ name: "dup" }, { name: "dup" }],
		};
		const errors = validateManifest(manifest);
		expect(errors).toContain("Duplicate skill name: 'dup'");
	});

	test("default_skill not in skills list errors", () => {
		const manifest = {
			project: { name: "test" },
			skills: [{ name: "skill-a" }],
			default_skill: "missing-skill",
		};
		const errors = validateManifest(manifest);
		expect(errors).toContain(
			"default_skill 'missing-skill' not found in skills list",
		);
	});

	test("checks.max_gateway_lines non-positive integer errors", () => {
		const manifest = {
			project: { name: "test" },
			skills: [],
			checks: { max_gateway_lines: 0 },
		};
		const errors = validateManifest(manifest);
		expect(errors).toContain(
			"checks.max_gateway_lines must be a positive integer",
		);
	});

	test("crp.tiers.inline_threshold out of [0,1] range errors", () => {
		const manifest = {
			project: { name: "test" },
			skills: [],
			crp: makeCrp({ inline_threshold: 1.5 }),
		};
		const errors = validateManifest(manifest);
		expect(errors).toContain(
			"crp.tiers.inline_threshold must be a number between 0 and 1",
		);
	});

	test("crp.tiers.inline_threshold below 0 errors", () => {
		const manifest = {
			project: { name: "test" },
			skills: [],
			crp: makeCrp({ inline_threshold: -0.1 }),
		};
		const errors = validateManifest(manifest);
		expect(errors).toContain(
			"crp.tiers.inline_threshold must be a number between 0 and 1",
		);
	});
});
