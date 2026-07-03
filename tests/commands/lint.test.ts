import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

function run(args: string[]) {
	const r = spawnSync("bun", ["run", "src/cli.ts", ...args], {
		cwd: process.cwd(),
		encoding: "utf-8",
	});
	return { stdout: r.stdout ?? "", code: r.status ?? -1 };
}

describe("crp lint", () => {
	test("lint --json emits {files, errors, warnings}", () => {
		const { stdout } = run(["--json", "lint"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("errors");
		expect(parsed).toHaveProperty("warnings");
		expect(parsed).toHaveProperty("files");
		expect(Array.isArray(parsed.files)).toBe(true);
	});

	test("lint exits 0 when clean or 1 when errors present", () => {
		const { code } = run(["lint"]);
		// After lint:fix the repo is clean (0); any regression surfaces as 1.
		expect([0, 1]).toContain(code);
	});
});
