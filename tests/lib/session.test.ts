import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSession,
	loadSession,
	saveSession,
	shouldSkipFile,
	updateAfterLoad,
} from "../../src/lib/session/state";

describe("createSession", () => {
	test("creates session with expected defaults", () => {
		const session = createSession("backend");
		expect(session.skill).toBe("backend");
		expect(session.current_round).toBe(0);
		expect(session.kg_version).toBe("");
		expect(session.file_registry).toEqual({});
		expect(session.loaded_files).toEqual([]);
		expect(session.skipped_files).toEqual([]);
		expect(session.pressure_level).toBe("normal");
		expect(session.artifact_trail).toBeTruthy();
	});

	test("generates session id with expected format", () => {
		const s1 = createSession("a");
		expect(s1.session_id).toMatch(/^sess_\d{8}_\d{6}$/);
	});
});

describe("saveSession and loadSession", () => {
	test("round-trip preserves data", async () => {
		const dir = join(tmpdir(), `crisp-test-${Date.now()}`);
		await mkdir(dir, { recursive: true });
		const path = join(dir, "state.json");
		const session = createSession("backend");
		session.kg_version = "v1";
		session.current_round = 3;
		try {
			saveSession(session, path);
			const loaded = loadSession(path, "backend");
			expect(loaded.skill).toBe("backend");
			expect(loaded.kg_version).toBe("v1");
			expect(loaded.current_round).toBe(3);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("loadSession on missing file creates new session", () => {
		const session = loadSession("/nonexistent/state.json", "frontend");
		expect(session.skill).toBe("frontend");
		expect(session.current_round).toBe(0);
	});
});

describe("shouldSkipFile", () => {
	test("returns false for unseen file", () => {
		const session = createSession("backend");
		expect(shouldSkipFile("rules.md", { content_hash: "abc" }, session)).toBe(
			false,
		);
	});

	test("returns true for recently loaded file with same hash", () => {
		const session = createSession("backend");
		session.current_round = 3;
		session.file_registry["rules.md"] = {
			last_loaded_round: 2,
			load_count: 1,
			last_content_hash: "abc",
		};
		expect(shouldSkipFile("rules.md", { content_hash: "abc" }, session)).toBe(
			true,
		);
	});

	test("returns false for stale file", () => {
		const session = createSession("backend");
		session.current_round = 5;
		session.file_registry["rules.md"] = {
			last_loaded_round: 2,
			load_count: 1,
			last_content_hash: "abc",
		};
		expect(shouldSkipFile("rules.md", { content_hash: "abc" }, session)).toBe(
			false,
		);
	});

	test("returns false for changed hash", () => {
		const session = createSession("backend");
		session.current_round = 3;
		session.file_registry["rules.md"] = {
			last_loaded_round: 2,
			load_count: 1,
			last_content_hash: "abc",
		};
		expect(shouldSkipFile("rules.md", { content_hash: "xyz" }, session)).toBe(
			false,
		);
	});

	test("respects custom dedupRounds", () => {
		const session = createSession("backend");
		session.current_round = 5;
		session.file_registry["rules.md"] = {
			last_loaded_round: 2,
			load_count: 1,
			last_content_hash: "abc",
		};
		expect(
			shouldSkipFile("rules.md", { content_hash: "abc" }, session, 5),
		).toBe(true);
	});
});

describe("updateAfterLoad", () => {
	test("increments round and updates registry", () => {
		const session = createSession("backend");
		session.current_round = 2;
		const updated = updateAfterLoad(
			session,
			["rules.md", "workflow.md"],
			["old.md"],
			"v2",
			{ "rules.md": { content_hash: "abc" } },
		);
		expect(updated.current_round).toBe(3);
		expect(updated.loaded_files).toEqual(["rules.md", "workflow.md"]);
		expect(updated.skipped_files).toEqual(["old.md"]);
		expect(updated.kg_version).toBe("v2");
		expect(updated.file_registry["rules.md"].last_loaded_round).toBe(3);
		expect(updated.file_registry["rules.md"].load_count).toBe(1);
	});

	test("does not mutate original session", () => {
		const session = createSession("backend");
		session.current_round = 1;
		const originalRound = session.current_round;
		const originalRegistry = session.file_registry;
		updateAfterLoad(session, ["a.md"], [], "v1");
		expect(session.current_round).toBe(originalRound);
		expect(session.file_registry).toBe(originalRegistry);
	});

	test("increments load count for existing files", () => {
		const session = createSession("backend");
		session.current_round = 2;
		session.file_registry["rules.md"] = {
			last_loaded_round: 1,
			load_count: 2,
			last_content_hash: "abc",
		};
		const updated = updateAfterLoad(session, ["rules.md"], [], "v1");
		expect(updated.file_registry["rules.md"].load_count).toBe(3);
		expect(updated.file_registry["rules.md"].last_loaded_round).toBe(3);
	});
});
