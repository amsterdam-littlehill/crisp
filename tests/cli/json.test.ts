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

	test("skill list --json includes source and registered parity fields", () => {
		const { stdout } = run(["--json", "skill", "list"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("skills");
		expect(Array.isArray(parsed.skills)).toBe(true);
		// Parity with human columns: Source, Registered (plus Default/Description)
		for (const s of parsed.skills) {
			expect(s).toHaveProperty("source");
			expect([null, "project", "user"]).toContain(s.source);
			expect(s).toHaveProperty("registered");
			expect(typeof s.registered).toBe("boolean");
			expect(s).toHaveProperty("level");
			expect(s).toHaveProperty("description");
		}
	});

	test("telemetry report --json emits valid JSON", () => {
		const { stdout } = run(["--json", "telemetry", "report"]);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("windowDays");
		expect(parsed).toHaveProperty("bySkill");
		expect(parsed).toHaveProperty("totalReads");
		expect(Array.isArray(parsed.bySkill)).toBe(true);
	});

	test("telemetry report --json includes totalTokens and topFiles parity fields", () => {
		const { stdout } = run(["--json", "telemetry", "report"]);
		const parsed = JSON.parse(stdout);
		// Parity with runReport: total tokens loaded + top files by load count
		expect(parsed).toHaveProperty("totalTokens");
		expect(typeof parsed.totalTokens).toBe("number");
		expect(parsed).toHaveProperty("topFiles");
		expect(Array.isArray(parsed.topFiles)).toBe(true);
		for (const f of parsed.topFiles) {
			expect(f).toHaveProperty("file");
			expect(f).toHaveProperty("loads");
			expect(typeof f.loads).toBe("number");
		}
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

	test("sync --check --json emits valid route preview with changes field", () => {
		// Run in repo root: sync --check reads .crp/routes.json which exists here.
		const { stdout } = run(["--json", "sync", "--check"]);
		const parsed = JSON.parse(stdout);
		// Owner contract: structured route diff/preview instead of human text.
		expect(parsed).toHaveProperty("changes");
		expect(typeof parsed.changes).toBe("boolean");
		expect(parsed).toHaveProperty("skills");
		expect(Array.isArray(parsed.skills)).toBe(true);
		// Counts mirror the human --check output
		expect(parsed).toHaveProperty("inline");
		expect(typeof parsed.inline).toBe("number");
		expect(parsed).toHaveProperty("lazy");
		expect(typeof parsed.lazy).toBe("number");
		expect(parsed).toHaveProperty("dead");
		expect(typeof parsed.dead).toBe("number");
		expect(parsed).toHaveProperty("added");
		expect(Array.isArray(parsed.added)).toBe(true);
		expect(parsed).toHaveProperty("removed");
		expect(Array.isArray(parsed.removed)).toBe(true);
	});

	test("sync --check --json emits diff arrays (added/removed)", () => {
		const { stdout } = run(["--json", "sync", "--check"]);
		const parsed = JSON.parse(stdout);
		// In repo root, routes.json has skills: [] and no project skills on disk,
		// so the diff should be empty but well-typed.
		expect(parsed.added.every((s: unknown) => typeof s === "string")).toBe(
			true,
		);
		expect(parsed.removed.every((s: unknown) => typeof s === "string")).toBe(
			true,
		);
		// skills entries carry name + strategy (the route preview)
		for (const s of parsed.skills) {
			expect(s).toHaveProperty("name");
			expect(s).toHaveProperty("strategy");
			expect(["inline", "lazy", "dead"]).toContain(s.strategy);
		}
	});
});
