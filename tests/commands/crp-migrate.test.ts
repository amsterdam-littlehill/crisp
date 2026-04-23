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
import { cmdCrpMigrate } from "../../src/commands/crp-migrate";
import {
	detectLegacyProject,
	generateMigrationReport,
	runMigration,
} from "../../src/lib/crp/migrate";

describe("crp-migrate.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-migrate-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writeLegacyManifest() {
		writeFileSync(
			join(tempDir, "crp.yaml"),
			[
				"project:",
				"  name: legacy-project",
				"skills:",
				"  - name: backend",
				"knowledge_graph:",
				"  enabled: true",
				"  max_tokens_execution: 400",
				"budget_audit:",
				"  max_gateway_tokens: 1000",
			].join("\n"),
			"utf-8",
		);
	}

	function writeLegacyShells() {
		mkdirSync(join(tempDir, ".claude"), { recursive: true });
		writeFileSync(join(tempDir, ".claude", "CLAUDE.md"), "# legacy", "utf-8");
	}

	test("detectLegacyProject finds legacy manifest keys", () => {
		writeLegacyManifest();
		const detection = detectLegacyProject(tempDir);
		expect(detection.isLegacy).toBe(true);
		expect(detection.legacyKeys).toContain("knowledge_graph");
		expect(detection.legacyKeys).toContain("budget_audit");
	});

	test("detectLegacyProject finds legacy shell files", () => {
		writeLegacyShells();
		const detection = detectLegacyProject(tempDir);
		expect(detection.isLegacy).toBe(true);
		expect(detection.legacyFiles).toContain(".claude/CLAUDE.md");
	});

	test("detectLegacyProject returns false for clean project", () => {
		const detection = detectLegacyProject(tempDir);
		expect(detection.isLegacy).toBe(false);
	});

	test("generateMigrationReport maps knowledge_graph and deprecates others", () => {
		writeLegacyManifest();
		const report = generateMigrationReport(tempDir);
		expect(report.migrated).toContain("knowledge_graph → crp.kg");
		expect(report.deprecated).toContain(
			"budget_audit (use 'crp audit' instead)",
		);
	});

	test("dry run does not modify files", () => {
		writeLegacyManifest();
		writeLegacyShells();
		const exitCode = cmdCrpMigrate();
		expect(exitCode).toBe(0);
		expect(existsSync(join(tempDir, ".claude", "CLAUDE.md.bak.v1"))).toBe(
			false,
		);
		const manifest = readFileSync(join(tempDir, "crp.yaml"), "utf-8");
		expect(manifest).toContain("knowledge_graph");
	});

	test("apply migration backs up files and transforms manifest", () => {
		writeLegacyManifest();
		writeLegacyShells();

		const result = runMigration(tempDir, { apply: true });
		expect(result.success).toBe(true);

		// Shell file backed up
		expect(existsSync(join(tempDir, ".claude", "CLAUDE.md.bak.v1"))).toBe(true);
		expect(existsSync(join(tempDir, ".claude", "CLAUDE.md"))).toBe(false);

		// Manifest transformed
		const manifest = readFileSync(join(tempDir, "crp.yaml"), "utf-8");
		expect(manifest).toContain("crp:");
		expect(manifest).toContain("version: 3");
		expect(manifest).not.toContain("knowledge_graph:");
		expect(manifest).not.toContain("budget_audit:");

		// .crp/ directory created
		expect(existsSync(join(tempDir, ".crp", "routes.json"))).toBe(true);
	});

	test("apply migration maps knowledge_graph max_tokens to crp.kg", () => {
		writeLegacyManifest();
		writeLegacyShells();

		runMigration(tempDir, { apply: true });

		const manifest = readFileSync(join(tempDir, "crp.yaml"), "utf-8");
		expect(manifest).toContain("max_query_tokens: 400");
	});

	test("non-legacy project returns success with empty report", () => {
		const result = runMigration(tempDir, { apply: true });
		expect(result.success).toBe(true);
		expect(result.report.migrated).toHaveLength(0);
	});
});
