import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

function run(args: string[]) {
	const r = spawnSync("bun", ["run", "src/cli.ts", ...args], {
		cwd: process.cwd(),
		encoding: "utf-8",
	});
	return {
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
		code: r.status ?? -1,
	};
}

describe("crp --json contract", () => {
	test("audit --json emits valid JSON", () => {
		const { stdout } = run(["--json", "audit"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("inlineCount");
		expect(parsed).toHaveProperty("deadCandidates");
		expect(parsed).toHaveProperty("histogram");
	});

	test("audit without --json emits human text", () => {
		const { stdout } = run(["audit"]);
		expect(() => JSON.parse(stdout)).toThrow();
		expect(stdout).toContain("CRP Audit");
	});
});
