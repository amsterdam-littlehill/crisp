import { describe, expect, test } from "bun:test";
import { ArtifactTrail } from "../../src/lib/artifacts/trail";

describe("ArtifactTrail", () => {
	test("starts with empty state", () => {
		const trail = new ArtifactTrail();
		expect(trail.artifacts).toEqual([]);
		expect(trail.current_round).toBe(0);
	});

	test("recordArtifact creates entry with auto id", () => {
		const trail = new ArtifactTrail();
		trail.startRound(1);
		const entry = trail.recordArtifact("test desc", "note");
		expect(entry.artifact_id).toBe("art_0001");
		expect(entry.round).toBe(1);
		expect(entry.description).toBe("test desc");
		expect(entry.artifact_type).toBe("note");
		expect(entry.timestamp).toBeTruthy();
	});

	test("recordDecision creates decision entry", () => {
		const trail = new ArtifactTrail();
		trail.startRound(2);
		const entry = trail.recordDecision("use bun", "tech");
		expect(entry.artifact_type).toBe("decision");
		expect(entry.description).toBe("use bun");
		expect(entry.metadata?.category).toBe("tech");
	});

	test("getArtifactsByRound filters correctly", () => {
		const trail = new ArtifactTrail();
		trail.startRound(1);
		trail.recordArtifact("a1", "note");
		trail.startRound(2);
		trail.recordArtifact("a2", "note");
		expect(trail.getArtifactsByRound(1).length).toBe(1);
		expect(trail.getArtifactsByRound(1)[0].description).toBe("a1");
		expect(trail.getArtifactsByRound(2).length).toBe(1);
		expect(trail.getArtifactsByRound(3).length).toBe(0);
	});

	test("getArtifactsByType filters correctly", () => {
		const trail = new ArtifactTrail();
		trail.startRound(1);
		trail.recordArtifact("n1", "note");
		trail.recordDecision("d1", "general");
		expect(trail.getArtifactsByType("note").length).toBe(1);
		expect(trail.getArtifactsByType("decision").length).toBe(1);
	});

	test("getDecisions returns only decisions", () => {
		const trail = new ArtifactTrail();
		trail.startRound(1);
		trail.recordArtifact("n1", "note");
		trail.recordDecision("d1", "general");
		trail.recordDecision("d2", "general");
		expect(trail.getDecisions().length).toBe(2);
	});

	test("toDict serializes correctly", () => {
		const trail = new ArtifactTrail();
		trail.startRound(1);
		trail.recordArtifact("test", "note", "path.md", { key: "val" });
		const dict = trail.toDict();
		expect(dict.current_round).toBe(1);
		expect(dict.artifact_count).toBe(1);
		expect(Array.isArray(dict.artifacts)).toBe(true);
		expect((dict.artifacts as any[])[0].type).toBe("note");
	});

	test("artifact ids increment sequentially", () => {
		const trail = new ArtifactTrail();
		trail.startRound(1);
		const e1 = trail.recordArtifact("first", "note");
		const e2 = trail.recordArtifact("second", "note");
		const e3 = trail.recordDecision("third");
		expect(e1.artifact_id).toBe("art_0001");
		expect(e2.artifact_id).toBe("art_0002");
		expect(e3.artifact_id).toBe("art_0003");
	});
});
