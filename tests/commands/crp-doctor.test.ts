import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCrpDoctor } from "../../src/commands/crp-doctor";
import { runDoctorChecks } from "../../src/lib/crp/doctor";

describe("crp-doctor.ts", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-doctor-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	});

	function setupHealthyProject() {
		mkdirSync(join(tempDir, ".crp", "telemetry"), { recursive: true });
		mkdirSync(join(tempDir, ".claude"), { recursive: true });
		writeFileSync(
			join(tempDir, ".crp", "telemetry", "reads.jsonl"),
			'{"event":"read"}\n',
			"utf-8",
		);
		writeFileSync(
			join(tempDir, ".claude", "settings.json"),
			JSON.stringify(
				{
					hooks: {
						PostToolUse: [
							{
								matcher: "Read",
								command:
									'bun run "' +
									join(tempDir, ".crp", "hooks", "post-read.ts") +
									'"',
							},
						],
						SessionStart: [
							{
								command:
									'bun run "' +
									join(tempDir, ".crp", "hooks", "session-start.ts") +
									'"',
							},
						],
					},
				},
				null,
				2,
			),
			"utf-8",
		);
	}

	test("healthy project returns ok for critical checks", async () => {
		setupHealthyProject();
		const checks = await runDoctorChecks(tempDir);

		const crpCheck = checks.find((c) => c.name === ".crp/ directory");
		expect(crpCheck?.status).toBe("ok");

		const hooksCheck = checks.find((c) => c.name === "Hooks registered");
		expect(hooksCheck?.status).toBe("ok");

		const readsCheck = checks.find((c) => c.name === "Telemetry reads");
		expect(readsCheck?.status).toBe("ok");
	});

	test("missing .crp/ directory fails", async () => {
		const checks = await runDoctorChecks(tempDir);
		const crpCheck = checks.find((c) => c.name === ".crp/ directory");
		expect(crpCheck?.status).toBe("fail");
	});

	test("missing hooks warns", async () => {
		mkdirSync(join(tempDir, ".crp"), { recursive: true });
		mkdirSync(join(tempDir, ".claude"), { recursive: true });
		writeFileSync(
			join(tempDir, ".claude", "settings.json"),
			JSON.stringify({}),
			"utf-8",
		);
		const checks = await runDoctorChecks(tempDir);
		const hooksCheck = checks.find((c) => c.name === "Hooks registered");
		expect(hooksCheck?.status).toBe("warn");
	});

	test("empty reads.jsonl warns", async () => {
		mkdirSync(join(tempDir, ".crp", "telemetry"), { recursive: true });
		writeFileSync(
			join(tempDir, ".crp", "telemetry", "reads.jsonl"),
			"",
			"utf-8",
		);
		const checks = await runDoctorChecks(tempDir);
		const readsCheck = checks.find((c) => c.name === "Telemetry reads");
		expect(readsCheck?.status).toBe("warn");
		expect(readsCheck?.message).toContain("Empty");
	});

	test("command returns 0 when no critical failures", async () => {
		setupHealthyProject();
		const exitCode = await cmdCrpDoctor();
		expect(exitCode).toBe(0);
	});

	test("command returns 1 when .crp/ is missing", async () => {
		const exitCode = await cmdCrpDoctor();
		expect(exitCode).toBe(1);
	});
});
