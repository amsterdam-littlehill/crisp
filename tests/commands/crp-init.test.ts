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
import { cmdCrpInit } from "../../src/commands/crp-init";

describe("crp-init.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-init-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("creates .crp directory structure", () => {
		const exitCode = cmdCrpInit();
		expect(exitCode).toBe(0);
		expect(existsSync(join(tempDir, ".crp"))).toBe(true);
		expect(existsSync(join(tempDir, ".crp", "kg"))).toBe(true);
		expect(existsSync(join(tempDir, ".crp", "telemetry"))).toBe(true);
		expect(existsSync(join(tempDir, ".crp", "hooks"))).toBe(true);
		expect(existsSync(join(tempDir, ".crp", "cache"))).toBe(true);
		expect(existsSync(join(tempDir, ".crp", "logs"))).toBe(true);
	});

	test("creates routes.json with version field", () => {
		cmdCrpInit();
		const routesPath = join(tempDir, ".crp", "routes.json");
		expect(existsSync(routesPath)).toBe(true);
		const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routes.version).toBe(3);
		expect(routes.skills).toBeArray();
	});

	test("creates crp.yaml at project root with default config", () => {
		cmdCrpInit();
		const yamlPath = join(tempDir, "crp.yaml");
		expect(existsSync(yamlPath)).toBe(true);
		const content = readFileSync(yamlPath, "utf-8");
		expect(content).toContain("crp:");
		expect(content).toContain("version: 3");
	});

	test("installs hooks to .claude/settings.local.json", () => {
		cmdCrpInit();
		const settingsPath = join(tempDir, ".claude", "settings.local.json");
		expect(existsSync(settingsPath)).toBe(true);
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(settings.hooks).toBeDefined();
		expect(settings.hooks.PostToolUse).toBeArray();
		// SessionStart should NOT be present (migrated to CLAUDE.md)
		expect(settings.hooks.SessionStart).toBeUndefined();
	});

	test("dry-run does not create files", () => {
		cmdCrpInit({ dryRun: true });
		expect(existsSync(join(tempDir, ".crp"))).toBe(false);
	});

	test("does not overwrite existing crp.yaml", () => {
		const yamlPath = join(tempDir, "crp.yaml");
		writeFileSync(yamlPath, "existing: true", "utf-8");

		cmdCrpInit();
		const content = readFileSync(yamlPath, "utf-8");
		expect(content).toBe("existing: true");
	});

	test("does not overwrite existing routes.json", () => {
		mkdirSync(join(tempDir, ".crp"), { recursive: true });
		const routesPath = join(tempDir, ".crp", "routes.json");
		writeFileSync(routesPath, JSON.stringify({ version: 99 }), "utf-8");

		cmdCrpInit();
		const routes = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routes.version).toBe(99);
	});

	test("copies post-read.mjs hook script to .crp/hooks/", () => {
		cmdCrpInit();
		expect(existsSync(join(tempDir, ".crp", "hooks", "post-read.mjs"))).toBe(
			true,
		);
	});
});
