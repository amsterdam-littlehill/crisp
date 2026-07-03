import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctorChecks } from "../../../src/lib/crp/doctor";

describe("doctor writability probe", () => {
	// Regression guard: the verdict must follow write success, NOT unlink success.
	// On Windows, AV/indexers can briefly lock the file so unlinkSync throws; that
	// must not flip .crp/ to "fail" (the original flaky behavior).
	test("treats .crp as writable when write succeeds", async () => {
		const dir = mkdtempSync(join(tmpdir(), "crp-doc-write-"));
		mkdirSync(join(dir, ".crp"), { recursive: true });
		const checks = await runDoctorChecks(dir);
		const c = checks.find((x) => x.name === ".crp/ directory");
		expect(c?.status).toBe("ok");
		rmSync(dir, { recursive: true, force: true });
	});
});
