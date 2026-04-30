import { describe, expect, test } from "bun:test";
import type { Routes } from "../src/lib/crp/injection";
import { buildInjection, freeEncoder } from "../src/lib/crp/injection";

describe("buildInjection", () => {
	test("empty routes returns base injection text", () => {
		const routes: Routes = { version: 3, skills: [] };
		const result = buildInjection(routes);
		expect(result.text).toContain("[CRP Router]");
		expect(result.text).toContain(
			"Session rule: re-read this block per task; do not assume context from prior tasks.",
		);
		expect(result.truncated).toBe(false);
		expect(result.droppedSkills).toEqual([]);
	});

	test("inline/lazy/dead skills correctly classified", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{
					name: "skill-a",
					strategy: "inline",
					freq: 0.8,
					summary: "Summary A",
				},
				{ name: "skill-b", strategy: "lazy", freq: 0.3, hint: "Hint B" },
				{ name: "skill-c", strategy: "dead", freq: 0.0 },
			],
		};
		const result = buildInjection(routes);
		expect(result.text).toContain("Inline: skill-a (Summary A)");
		expect(result.text).toContain("On-demand: skill-b (Hint B)");
		expect(result.text).toContain("Dead candidate: skill-c");
		expect(result.truncated).toBe(false);
	});

	test("token budget sufficient - no truncation", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{ name: "skill-a", strategy: "inline", freq: 0.8 },
				{ name: "skill-b", strategy: "lazy", freq: 0.3 },
			],
		};
		const result = buildInjection(routes, 1000);
		expect(result.truncated).toBe(false);
		expect(result.droppedSkills).toEqual([]);
	});

	test("token budget insufficient - truncates by priority (dead first, then lazy, then inline)", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{ name: "inline-1", strategy: "inline", freq: 0.9 },
				{ name: "lazy-1", strategy: "lazy", freq: 0.5 },
				{ name: "dead-1", strategy: "dead", freq: 0.1 },
				{ name: "dead-2", strategy: "dead", freq: 0.05 },
			],
		};
		const result = buildInjection(routes, 50);
		expect(result.truncated).toBe(true);
		expect(result.droppedSkills.length).toBeGreaterThan(0);
		// Lowest-freq dead skill dropped first; no inline or lazy dropped
		expect(result.droppedSkills).toContain("dead-2");
		expect(result.droppedSkills).not.toContain("inline-1");
		expect(result.droppedSkills).not.toContain("lazy-1");
	});

	test("KG topics correctly appended", () => {
		const routes: Routes = {
			version: 3,
			skills: [],
			kg: {
				topics: ["topic-a", "topic-b"],
				query_command: "custom query",
			},
		};
		const result = buildInjection(routes);
		expect(result.text).toContain("KG: Topics: topic-a, topic-b");
		expect(result.text).toContain("Query via custom query");
	});

	test("freeEncoder releases singleton", () => {
		// Just verify it doesn't throw
		expect(() => freeEncoder()).not.toThrow();
	});
});
