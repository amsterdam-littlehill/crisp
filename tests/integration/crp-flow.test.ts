import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
import { cmdCrpAudit } from "../../src/commands/crp-audit";
import { cmdCrpCheck } from "../../src/commands/crp-check";
import { cmdCrpInit } from "../../src/commands/crp-init";
import { cmdCrpKg } from "../../src/commands/crp-kg";
import { cmdCrpSync } from "../../src/commands/crp-sync";
import { buildKgIndex, saveKgIndex } from "../../src/lib/crp/kg-index";
import { loadManifest, saveManifest } from "../../src/lib/manifest/io";
import type { CrpManifest } from "../../src/lib/manifest/types";

describe("CRP v3 end-to-end flow", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-flow-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function setupSkill(name: string) {
		const skillDir = join(tempDir, ".claude", "skills", name);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`# ${name}\n\n## Common Tasks\n\n- Task A\n- Task B\n`,
			"utf-8",
		);
		writeFileSync(
			join(skillDir, ".crp-kg.json"),
			JSON.stringify({
				project: name,
				generated_at: new Date().toISOString(),
				nodes: {
					files: [
						{
							id: "f1",
							path: "SKILL.md",
							skill: name,
							tier: "L0",
							token_count: 100,
							content_hash: "abc",
							summary: `${name} skill summary`,
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
							name: name,
							category: "domain",
						},
					],
				},
				edges: [],
			}),
			"utf-8",
		);
	}

	function addSkillToManifest(name: string) {
		const manifestPath = join(tempDir, ".crp", "crp.yaml");
		const manifest = loadManifest(manifestPath) as CrpManifest;
		manifest.skills = manifest.skills || [];
		manifest.skills.push({ name, description: `${name} skill` });
		saveManifest(manifestPath, manifest);
		// Also update root crp.yaml for consistency
		const rootManifest = loadManifest(join(tempDir, "crp.yaml")) as CrpManifest;
		rootManifest.skills = rootManifest.skills || [];
		rootManifest.skills.push({ name, description: `${name} skill` });
		saveManifest(join(tempDir, "crp.yaml"), rootManifest);
	}

	function writeMockReads(skillName: string, sessionCount: number) {
		const telemetryDir = join(tempDir, ".crp", "telemetry");
		mkdirSync(telemetryDir, { recursive: true });
		const lines: string[] = [];
		for (let i = 0; i < sessionCount; i++) {
			lines.push(
				JSON.stringify({
					session_id: `sess-${i}`,
					ts: new Date().toISOString(),
					file: `.claude/skills/${skillName}/SKILL.md`,
					tokens: 50,
				}),
			);
		}
		writeFileSync(
			join(telemetryDir, "reads.jsonl"),
			lines.join("\n") + "\n",
			"utf-8",
		);
	}

	test("full flow: init → reads → sync → audit → check → kg", () => {
		// 1. Init
		expect(cmdCrpInit({ project: "flow-test" })).toBe(0);
		expect(existsSync(join(tempDir, ".crp"))).toBe(true);

		// 2. Setup skill and manifest
		setupSkill("backend");
		addSkillToManifest("backend");

		// 3. Build KG index
		const index = buildKgIndex(tempDir);
		saveKgIndex(index, tempDir);
		expect(existsSync(join(tempDir, ".crp", "kg", "index.json"))).toBe(true);

		// 4. Simulate reads
		writeMockReads("backend", 5);

		// 5. Sync generates routes
		expect(cmdCrpSync()).toBe(0);
		const routesPath = join(tempDir, ".crp", "routes.json");
		expect(existsSync(routesPath)).toBe(true);
		const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routes.version).toBe(3);
		expect(routes.skills.length).toBeGreaterThan(0);

		// 6. Audit runs without error
		expect(cmdCrpAudit()).toBe(0);

		// 7. Check passes
		expect(cmdCrpCheck()).toBe(0);

		// 8. KG query returns results
		const kgResult = cmdCrpKg("backend");
		expect(kgResult).toBe(0);
	});

	test("check fails when injection is truncated", () => {
		cmdCrpInit({ project: "trunc-test" });
		setupSkill("backend");
		addSkillToManifest("backend");

		// Create an oversized routes.json that will truncate
		const skills = Array.from({ length: 30 }, (_, i) => ({
			name: `skill-${i}`,
			strategy: "inline" as const,
			freq: 0.9,
			summary: `Very long summary for skill ${i} that takes many tokens to describe and should cause truncation when combined`,
		}));
		writeFileSync(
			join(tempDir, ".crp", "routes.json"),
			JSON.stringify({ version: 3, skills, l0_inject_tokens: 9999 }),
			"utf-8",
		);

		expect(cmdCrpCheck()).toBe(1);
	});
});
