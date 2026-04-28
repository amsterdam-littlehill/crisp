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
import { cmdCrpSync } from "../../src/commands/crp-sync";

describe("crp-sync.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-sync-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		mkdirSync(join(tempDir, ".crp", "telemetry"), { recursive: true });
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writeReads(records: unknown[]) {
		const readsPath = join(tempDir, ".crp", "telemetry", "reads.jsonl");
		const lines = records.map((r) => JSON.stringify(r)).join("\n");
		writeFileSync(readsPath, `${lines}\n`, "utf-8");
	}

	function writeManifest(content: string) {
		const manifestPath = join(tempDir, ".crp", "crp.yaml");
		writeFileSync(manifestPath, content, "utf-8");
	}

	test("generates routes.json from telemetry", () => {
		const now = new Date().toISOString();
		writeReads([
			{
				ts: now,
				session_id: "s1",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s2",
				file: "/project/.claude/skills/backend.skill.md",
				tokens: 10,
			},
			{
				ts: now,
				session_id: "s3",
				file: "/project/.claude/skills/frontend/SKILL.md",
				tokens: 10,
			},
		]);

		writeManifest(
			[
				"project:",
				"  name: test",
				"skills: []",
				"crp:",
				"  version: 3",
				"  tiers:",
				"    inline_threshold: 0.5",
				"    hint_threshold: 0.1",
			].join("\n"),
		);

		const exitCode = cmdCrpSync();
		expect(exitCode).toBe(0);

		const routesPath = join(tempDir, ".crp", "routes.json");
		expect(existsSync(routesPath)).toBe(true);

		const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routes.version).toBe(3);
		expect(routes.skills).toBeArray();

		const backend = routes.skills.find(
			(s: { name: string }) => s.name === "backend",
		);
		expect(backend).toBeDefined();
		expect(backend.strategy).toBe("inline"); // 2/3 = 0.67 >= 0.5

		const frontend = routes.skills.find(
			(s: { name: string }) => s.name === "frontend",
		);
		expect(frontend).toBeDefined();
		expect(frontend.strategy).toBe("lazy"); // 1/3 = 0.33 < 0.5, >= 0.1
	});

	test("check mode does not write routes.json", () => {
		const exitCode = cmdCrpSync({ check: true });
		expect(exitCode).toBe(0);
		expect(existsSync(join(tempDir, ".crp", "routes.json"))).toBe(false);
	});

	test("works with empty telemetry", () => {
		writeManifest(["project:", "  name: test", "skills: []"].join("\n"));

		const exitCode = cmdCrpSync();
		expect(exitCode).toBe(0);

		const routesPath = join(tempDir, ".crp", "routes.json");
		expect(existsSync(routesPath)).toBe(true);
		const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routes.skills).toBeEmpty();
	});
});
