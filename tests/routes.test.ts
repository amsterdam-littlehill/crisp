import { describe, expect, test } from "bun:test";
import type { SkillFrequency } from "../src/lib/crp/analyzer";
import { generateRoutes } from "../src/lib/crp/routes";
import type { CrpManifest } from "../src/lib/manifest/io";

describe("generateRoutes", () => {
	const baseManifest: CrpManifest = {
		project: { name: "test" },
		skills: [],
		crp: {
			version: 3,
			session_inject: { max_tokens: 300, include_kg_index: false },
			tiers: { inline_threshold: 0.5, hint_threshold: 0.1 },
			telemetry: { window_days: 30 },
			kg: { max_query_tokens: 100, index_inline_tokens: 200 },
		},
	};

	test("high frequency skill (freq >= inlineThreshold) marked as inline", () => {
		const freqs: SkillFrequency[] = [
			{
				name: "skill-a",
				freq: 0.8,
				sessions: 8,
				totalSessions: 10,
				source: "project",
			},
		];
		const routes = generateRoutes(baseManifest, freqs);
		const skill = routes.skills.find((s) => s.name === "skill-a");
		expect(skill).toBeDefined();
		expect(skill?.strategy).toBe("inline");
	});

	test("high frequency user skill demoted to lazy", () => {
		const freqs: SkillFrequency[] = [
			{
				name: "user-skill",
				freq: 0.8,
				sessions: 8,
				totalSessions: 10,
				source: "user",
			},
		];
		const routes = generateRoutes(baseManifest, freqs);
		const skill = routes.skills.find((s) => s.name === "user-skill");
		expect(skill).toBeDefined();
		expect(skill?.strategy).toBe("lazy");
	});

	test("zero frequency skill marked as lazy", () => {
		const freqs: SkillFrequency[] = [
			{
				name: "new-skill",
				freq: 0,
				sessions: 0,
				totalSessions: 10,
				source: "project",
			},
		];
		const routes = generateRoutes(baseManifest, freqs);
		const skill = routes.skills.find((s) => s.name === "new-skill");
		expect(skill).toBeDefined();
		expect(skill?.strategy).toBe("lazy");
	});

	test("low frequency skill marked as dead", () => {
		const freqs: SkillFrequency[] = [
			{
				name: "low-skill",
				freq: 0.05,
				sessions: 1,
				totalSessions: 20,
				source: "project",
			},
		];
		const routes = generateRoutes(baseManifest, freqs);
		const skill = routes.skills.find((s) => s.name === "low-skill");
		expect(skill).toBeDefined();
		expect(skill?.strategy).toBe("dead");
	});

	test("thresholds can be overridden via options", () => {
		const freqs: SkillFrequency[] = [
			{
				name: "skill-a",
				freq: 0.4,
				sessions: 4,
				totalSessions: 10,
				source: "project",
			},
		];
		// With default threshold 0.5, this would be lazy
		const routes = generateRoutes(baseManifest, freqs, [], {
			inlineThreshold: 0.3,
		});
		const skill = routes.skills.find((s) => s.name === "skill-a");
		expect(skill).toBeDefined();
		expect(skill?.strategy).toBe("inline");
	});
});
