import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildKgIndex,
	loadKgIndex,
	queryKg,
	saveKgIndex,
} from "../../../src/lib/crp/kg-index";

describe("kg-index.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-kg-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function createMockKg(skillName: string, content: Record<string, unknown>) {
		const skillDir = join(tempDir, ".claude", "skills", skillName);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, ".crp-kg.json"),
			JSON.stringify(content),
			"utf-8",
		);
	}

	test("buildKgIndex collects chunks from KG files", () => {
		createMockKg("backend", {
			project: "backend",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "SKILL.md",
						skill: "backend",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "Backend skill summary",
					},
				],
				task_types: [
					{
						id: "t1",
						keywords: ["api", "rest"],
						description: "API tasks",
						category: "dev",
					},
				],
				tags: [
					{
						id: "tag1",
						name: "nestjs",
						category: "framework",
					},
				],
			},
			edges: [],
		});

		const index = buildKgIndex(tempDir);
		expect(index.chunks).toHaveLength(1);
		expect(index.chunks[0].content).toBe("Backend skill summary");
		expect(index.chunks[0].topics).toContain("backend");
		expect(index.chunks[0].topics).toContain("nestjs");
		expect(index.chunks[0].topics).toContain("api");
	});

	test("saveKgIndex and loadKgIndex roundtrip", () => {
		const index = buildKgIndex(tempDir);
		saveKgIndex(index, tempDir);

		const loaded = loadKgIndex(tempDir);
		expect(loaded).not.toBeNull();
		expect(loaded!.version).toBe(1);
		expect(loaded!.chunks).toEqual(index.chunks);
	});

	test("queryKg returns matching content", () => {
		createMockKg("backend", {
			project: "backend",
			generated_at: new Date().toISOString(),
			nodes: {
				files: [
					{
						id: "f1",
						path: "SKILL.md",
						skill: "backend",
						tier: "L0",
						token_count: 100,
						content_hash: "abc",
						summary: "NestJS API patterns",
					},
				],
				task_types: [],
				tags: [
					{
						id: "tag1",
						name: "nestjs",
						category: "framework",
					},
				],
			},
			edges: [],
		});

		const index = buildKgIndex(tempDir);
		saveKgIndex(index, tempDir);

		const result = queryKg("nestjs", 200, tempDir);
		expect(result).toContain("NestJS");
	});

	test("queryKg returns no results for unknown topic", () => {
		saveKgIndex(
			{
				version: 1,
				generated_at: new Date().toISOString(),
				chunks: [],
			},
			tempDir,
		);
		const result = queryKg("unknown", 200, tempDir);
		expect(result).toContain("No KG index found");
	});
});
