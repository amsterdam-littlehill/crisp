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
import { cmdKgSync } from "../../src/commands/kg";
import { cmdSkillCreate, cmdSkillDelete } from "../../src/commands/skill";
import { cmdTelemetryReport } from "../../src/commands/telemetry";
import { queryKg } from "../../src/lib/crp/kg-index";
import { loadManifest, saveManifest } from "../../src/lib/manifest/io";
import type { CrpManifest } from "../../src/lib/manifest/types";

describe("CRP end-to-end flow", () => {
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
			`${lines.join("\n")}\n`,
			"utf-8",
		);
	}

	test("full flow: init → reads → sync → audit → check → kg", () => {
		// 1. Init
		expect(cmdCrpInit({ project: "flow-test" })).toBe(0);
		expect(existsSync(join(tempDir, ".crp"))).toBe(true);

		// 2. Create skill via CLI
		expect(cmdSkillCreate({ name: "backend", description: "Backend dev" })).toBe(0);
		expect(existsSync(join(tempDir, ".claude", "skills", "backend"))).toBe(true);
		expect(existsSync(join(tempDir, ".claude", "skills", "backend", "SKILL.md"))).toBe(true);

		// Verify manifest updated
		const manifestAfterCreate = loadManifest(join(tempDir, "crp.yaml"));
		expect(manifestAfterCreate.skills?.some((s) => s.name === "backend")).toBe(true);

		// 3. Sync KG (generates .crp-kg.json AND builds index)
		expect(cmdKgSync({ skill: "backend" })).toBe(0);
		expect(existsSync(join(tempDir, ".crp", "kg", "index.json"))).toBe(true);

		// 4. Verify kg query works
		const queryResult = queryKg("backend", 200, tempDir);
		expect(queryResult).not.toContain("No KG index found");
		expect(queryResult.length).toBeGreaterThan(0);

		// 5. Simulate reads
		writeMockReads("backend", 5);

		// 6. Sync generates routes
		expect(cmdCrpSync()).toBe(0);
		const routesPath = join(tempDir, ".crp", "routes.json");
		expect(existsSync(routesPath)).toBe(true);
		const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routes.version).toBe(3);
		expect(routes.skills.length).toBeGreaterThan(0);

		// 7. Audit runs without error
		expect(cmdCrpAudit()).toBe(0);

		// 8. Check passes
		expect(cmdCrpCheck()).toBe(0);

		// 9. Telemetry report reads both sources
		expect(cmdTelemetryReport({ skill: null })).toBe(0);

		// 10. Skill delete cleans up
		expect(cmdSkillDelete({ name: "backend", force: true })).toBe(0);
		expect(existsSync(join(tempDir, ".claude", "skills", "backend"))).toBe(false);
	});

	test("check fails when injection is truncated", () => {
		cmdCrpInit({ project: "trunc-test" });
		expect(cmdSkillCreate({ name: "backend", description: "Backend dev" })).toBe(0);

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

		expect(cmdCrpCheck({ ci: true })).toBe(1);
	});
});
