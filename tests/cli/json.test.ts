import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

	test("status --json emits valid JSON", () => {
		const { stdout } = run(["--json", "status"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("project");
		expect(parsed).toHaveProperty("manifest");
		expect(parsed).toHaveProperty("skills");
		expect(parsed).toHaveProperty("tokenBudget");
	});

	test("status without --json emits human text", () => {
		const { stdout } = run(["status"]);
		expect(() => JSON.parse(stdout)).toThrow();
		expect(stdout).toContain("CRP Status");
	});

	test("check --json emits valid JSON", () => {
		const { stdout } = run(["--json", "check"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("withinBudget");
		expect(parsed).toHaveProperty("maxTokens");
		expect(parsed).toHaveProperty("truncated");
		expect(parsed).toHaveProperty("droppedSkills");
	});

	test("validate --json emits valid JSON", () => {
		const { stdout } = run(["--json", "validate"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("valid");
		expect(parsed).toHaveProperty("errors");
		expect(Array.isArray(parsed.errors)).toBe(true);
	});

	test("doctor --json emits valid JSON", () => {
		const { stdout } = run(["--json", "doctor"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("checks");
		expect(Array.isArray(parsed.checks)).toBe(true);
	});

	test("quality --json emits valid JSON", () => {
		const { stdout } = run(["--json", "quality", "CLAUDE.md"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("overall");
		expect(parsed).toHaveProperty("production_ready");
	});

	test("skill list --json emits valid JSON", () => {
		const { stdout } = run(["--json", "skill", "list"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("skills");
		expect(parsed).toHaveProperty("total");
		expect(Array.isArray(parsed.skills)).toBe(true);
	});

	test("telemetry report --json emits valid JSON", () => {
		const { stdout } = run(["--json", "telemetry", "report"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("windowDays");
		expect(parsed).toHaveProperty("bySkill");
		expect(parsed).toHaveProperty("totalReads");
		expect(Array.isArray(parsed.bySkill)).toBe(true);
	});

	test("telemetry report --json exits 1 with error JSON outside a CRP project", () => {
		// Mirrors the human path's "No crp.yaml found" guard (regression guard).
		const tmp = mkdtempSync(join(tmpdir(), "crp-json-noproj-"));
		try {
			const r = spawnSync(
				"bun",
				[
					"run",
					join(process.cwd(), "src", "cli.ts"),
					"--json",
					"telemetry",
					"report",
				],
				{ cwd: tmp, encoding: "utf-8" },
			);
			expect(r.status).toBe(1);
			const parsed = JSON.parse(r.stdout ?? "");
			expect(parsed).toHaveProperty("error");
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("kg query --json emits valid JSON", () => {
		const { stdout } = run(["--json", "kg", "query", "backend"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("topic");
	});
});
