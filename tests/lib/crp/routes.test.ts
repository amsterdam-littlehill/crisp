import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SkillFrequency } from "../../../src/lib/crp/analyzer";
import { generateRoutes } from "../../../src/lib/crp/routes";
import type { CrpManifest } from "../../../src/lib/manifest/io";

describe("routes.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-routes-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function makeManifest(overrides?: Partial<CrpManifest["crp"]>): CrpManifest {
		return {
			project: { name: "test" },
			skills: [],
			crp: {
				version: 3,
				session_inject: { max_tokens: 300, include_kg_index: true },
				tiers: {
					inline_threshold: 0.5,
					hint_threshold: 0.1,
				},
				telemetry: { window_days: 30 },
				kg: { max_query_tokens: 200, index_inline_tokens: 80 },
				...overrides,
			},
		} as CrpManifest;
	}

	test("classifies skills by threshold", () => {
		const frequencies: SkillFrequency[] = [
			{ name: "backend", freq: 0.8, sessions: 8, totalSessions: 10 },
			{ name: "frontend", freq: 0.3, sessions: 3, totalSessions: 10 },
			{ name: "docs", freq: 0.05, sessions: 1, totalSessions: 10 },
		];

		const routes = generateRoutes(makeManifest(), frequencies);
		expect(routes.version).toBe(3);
		expect(routes.skills).toHaveLength(3);

		const backend = routes.skills.find((s) => s.name === "backend");
		expect(backend?.strategy).toBe("inline");

		const frontend = routes.skills.find((s) => s.name === "frontend");
		expect(frontend?.strategy).toBe("lazy");

		const docs = routes.skills.find((s) => s.name === "docs");
		expect(docs?.strategy).toBe("dead");
	});

	test("includes KG topics when provided", () => {
		const routes = generateRoutes(makeManifest(), [], ["auth", "db"]);
		expect(routes.kg?.topics).toEqual(["auth", "db"]);
		expect(routes.kg?.query_command).toContain("crp kg");
	});

	test("computes l0_inject_tokens", () => {
		const frequencies: SkillFrequency[] = [
			{ name: "backend", freq: 0.8, sessions: 8, totalSessions: 10 },
		];

		const routes = generateRoutes(makeManifest(), frequencies);
		expect(routes.l0_inject_tokens).toBeDefined();
		expect(typeof routes.l0_inject_tokens).toBe("number");
		expect(routes.l0_inject_tokens).toBeGreaterThan(0);
	});

	test("uses manifest thresholds", () => {
		const manifest = makeManifest({
			tiers: { inline_threshold: 0.9, hint_threshold: 0.5 },
		});
		const frequencies: SkillFrequency[] = [
			{ name: "backend", freq: 0.8, sessions: 8, totalSessions: 10 },
			{ name: "frontend", freq: 0.3, sessions: 3, totalSessions: 10 },
		];

		const routes = generateRoutes(manifest, frequencies);
		const backend = routes.skills.find((s) => s.name === "backend");
		expect(backend?.strategy).toBe("lazy"); // 0.8 < 0.9

		const frontend = routes.skills.find((s) => s.name === "frontend");
		expect(frontend?.strategy).toBe("dead"); // 0.3 < 0.5
	});

	test("generates hint for lazy skills", () => {
		const frequencies: SkillFrequency[] = [
			{ name: "testing", freq: 0.3, sessions: 3, totalSessions: 10 },
		];

		const routes = generateRoutes(makeManifest(), frequencies);
		const testing = routes.skills.find((s) => s.name === "testing");
		expect(testing?.hint).toContain('Skill("testing")');
	});

	test("compresses inline skill summary when file exists", () => {
		mkdirSync(join(tempDir, ".claude", "skills", "backend"), {
			recursive: true,
		});
		writeFileSync(
			join(tempDir, ".claude", "skills", "backend", "SKILL.md"),
			["# Backend", "", "- Use NestJS", "- Prefer DI"].join("\n"),
			"utf-8",
		);

		const frequencies: SkillFrequency[] = [
			{ name: "backend", freq: 0.8, sessions: 8, totalSessions: 10 },
		];

		const routes = generateRoutes(makeManifest(), frequencies);
		const backend = routes.skills.find((s) => s.name === "backend");
		expect(backend?.summary).toBeDefined();
		expect(backend?.summary?.length).toBeGreaterThan(0);
	});
});
