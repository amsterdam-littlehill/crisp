import { describe, expect, test } from "bun:test";
import type { KnowledgeGraph } from "../src/lib/kg/validator";
import { validateKg } from "../src/lib/kg/validator";

describe("validateKg", () => {
	test("valid KG returns empty array", () => {
		const kg: KnowledgeGraph = {
			project: "test-project",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "/a",
						skill: "s1",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "",
					},
				],
				task_types: [{ id: "t1", keywords: [], description: "", category: "" }],
				tags: [{ id: "tag1", name: "", category: "" }],
			},
			edges: [{ from: "f1", to: "t1", type: "REQUIRES" }],
		};
		const errors = validateKg(kg);
		expect(errors).toEqual([]);
	});

	test("non-object input errors", () => {
		const errors = validateKg("not-an-object");
		expect(errors).toContain("KG must be a dictionary");
	});

	test("null input errors", () => {
		const errors = validateKg(null);
		expect(errors).toContain("KG must be a dictionary");
	});

	test("array input errors", () => {
		const errors = validateKg([]);
		expect(errors).toContain("KG must be a dictionary");
	});

	test("missing project errors", () => {
		const kg = {
			generated_at: new Date().toISOString(),
			nodes: { files: [], task_types: [], tags: [] },
			edges: [],
		};
		const errors = validateKg(kg);
		expect(errors).toContain("Missing required field: project");
	});

	test("edge referencing nonexistent node errors", () => {
		const kg: KnowledgeGraph = {
			project: "test",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "/a",
						skill: "s1",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "",
					},
				],
				task_types: [],
				tags: [],
			},
			edges: [{ from: "nonexistent", to: "f1", type: "REQUIRES" }],
		};
		const errors = validateKg(kg);
		expect(errors).toContain(
			"edges[0] 'from' references nonexistent node: nonexistent",
		);
	});

	test("edge missing from errors", () => {
		const kg: KnowledgeGraph = {
			project: "test",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "/a",
						skill: "s1",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "",
					},
				],
				task_types: [],
				tags: [],
			},
			edges: [
				{
					from: "",
					to: "f1",
					type: "REQUIRES",
				} as unknown as KnowledgeGraph["edges"][number],
			],
		};
		const errors = validateKg(kg);
		expect(errors).toContain("edges[0] missing 'from'");
	});

	test("edge missing to errors", () => {
		const kg: KnowledgeGraph = {
			project: "test",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "/a",
						skill: "s1",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "",
					},
				],
				task_types: [],
				tags: [],
			},
			edges: [
				{
					from: "f1",
					to: "",
					type: "REQUIRES",
				} as unknown as KnowledgeGraph["edges"][number],
			],
		};
		const errors = validateKg(kg);
		expect(errors).toContain("edges[0] missing 'to'");
	});

	test("edge missing type errors", () => {
		const kg: KnowledgeGraph = {
			project: "test",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "/a",
						skill: "s1",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "",
					},
				],
				task_types: [],
				tags: [],
			},
			edges: [
				{ from: "f1", to: "f1" } as unknown as KnowledgeGraph["edges"][number],
			],
		};
		const errors = validateKg(kg);
		expect(errors).toContain("edges[0] missing 'type'");
	});
});
