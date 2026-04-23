import { describe, expect, test } from "bun:test";
import { analyzeSession, formatReport } from "../../src/lib/reflector/analyzer";
import { createSession } from "../../src/lib/session/state";

describe("analyzeSession", () => {
	test("produces metrics for loaded session", () => {
		const session = createSession("backend");
		session.current_round = 3;
		session.file_registry = {
			"rules.md": {
				last_loaded_round: 3,
				load_count: 3,
				last_content_hash: "a",
			},
			"workflow.md": {
				last_loaded_round: 2,
				load_count: 1,
				last_content_hash: "b",
			},
		};
		session.skipped_files = ["old.md"];
		session.loaded_files = ["rules.md"];
		const report = analyzeSession(session);
		expect(report.session_id).toBe(session.session_id);
		expect(report.skill).toBe("backend");
		expect(report.metrics.total_rounds).toBe(3);
		expect(report.metrics.total_loaded).toBe(4);
		expect(report.metrics.total_skipped).toBe(1);
		expect(report.metrics.most_loaded_file).toBe("rules.md");
		expect(report.metrics.most_skipped_file).toBe("old.md");
		expect(report.recommendations.length).toBeGreaterThan(0);
	});

	test("recommends success for healthy session", () => {
		const session = createSession("backend");
		session.current_round = 2;
		session.file_registry = {
			"rules.md": {
				last_loaded_round: 1,
				load_count: 1,
				last_content_hash: "a",
			},
		};
		session.skipped_files = ["old.md"];
		session.loaded_files = ["rules.md"];
		session.pressure_level = "normal";
		const report = analyzeSession(session);
		expect(report.recommendations.some((r) => r.includes("success"))).toBe(
			true,
		);
	});

	test("flags high pressure", () => {
		const session = createSession("backend");
		session.current_round = 2;
		session.pressure_level = "hard";
		session.loaded_files = ["rules.md"];
		const report = analyzeSession(session);
		expect(report.recommendations.some((r) => r.includes("pressure"))).toBe(
			true,
		);
	});

	test("flags no loaded files", () => {
		const session = createSession("backend");
		session.current_round = 0;
		const report = analyzeSession(session);
		expect(report.recommendations.some((r) => r.includes("No files"))).toBe(
			true,
		);
	});
});

describe("formatReport", () => {
	test("includes session id and skill", () => {
		const session = createSession("backend");
		session.current_round = 1;
		session.loaded_files = ["rules.md"];
		const report = analyzeSession(session);
		const formatted = formatReport(report);
		expect(formatted).toContain("Session ID:");
		expect(formatted).toContain("Skill: backend");
		expect(formatted).toContain("Recommendations:");
	});

	test("includes metrics", () => {
		const session = createSession("backend");
		session.current_round = 2;
		session.file_registry = {
			"rules.md": {
				last_loaded_round: 2,
				load_count: 2,
				last_content_hash: "a",
			},
		};
		session.loaded_files = ["rules.md"];
		const report = analyzeSession(session);
		const formatted = formatReport(report);
		expect(formatted).toContain("Total Rounds:");
		expect(formatted).toContain("Total Loaded:");
		expect(formatted).toContain("Dedup Savings:");
	});
});
