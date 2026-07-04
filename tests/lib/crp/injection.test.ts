import { describe, expect, test } from "bun:test";
import type { Routes } from "../../../src/lib/crp/injection";
import { buildInjection } from "../../../src/lib/crp/injection";
import { estimateTokens } from "../../../src/lib/tokens";

describe("injection.ts", () => {
	const baseRoutes: Routes = {
		version: 3,
		skills: [],
	};

	test("estimateTokens counts tokens for text", () => {
		const tokens = estimateTokens("hello world");
		expect(tokens).toBeGreaterThan(0);
	});

	test("buildInjection returns text with header", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{
					name: "backend",
					strategy: "inline",
					freq: 0.8,
					summary: "NestJS patterns",
				},
			],
		};

		const result = buildInjection(routes, 1000);
		expect(result.text).toContain("[CRP Router]");
		expect(result.text).toContain("backend");
		expect(result.truncated).toBe(false);
		expect(result.droppedSkills).toBeEmpty();
	});

	test("buildInjection truncates when over limit", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{
					name: "a",
					strategy: "inline",
					freq: 0.9,
					summary: "Summary for skill A",
				},
				{
					name: "b",
					strategy: "inline",
					freq: 0.8,
					summary: "Summary for skill B",
				},
				{
					name: "c",
					strategy: "inline",
					freq: 0.7,
					summary: "Summary for skill C",
				},
				{ name: "d", strategy: "lazy", freq: 0.6, hint: "Load d" },
				{ name: "e", strategy: "dead", freq: 0.1 },
			],
			kg: {
				topics: [
					"auth",
					"db",
					"api",
					"cache",
					"queue",
					"deploy",
					"monitor",
					"test",
					"lint",
					"docs",
				],
				query_command: "crp kg '<topic>'",
			},
		};

		const result = buildInjection(routes, 50);
		expect(result.truncated).toBe(true);
		expect(result.droppedSkills.length).toBeGreaterThan(0);
		expect(result.text).toContain("[CRP Router]");
		// Header and session rule should always remain
		expect(result.text).toContain("Session rule:");
	});

	test("buildInjection drops dead before lazy before inline", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{ name: "inline1", strategy: "inline", freq: 0.9 },
				{ name: "lazy1", strategy: "lazy", freq: 0.5 },
				{ name: "dead1", strategy: "dead", freq: 0.1 },
			],
		};

		const result = buildInjection(routes, 20);
		expect(result.truncated).toBe(true);
		// dead1 should be dropped first
		expect(result.droppedSkills).toContain("dead1");
	});

	test("buildInjection handles empty skills", () => {
		const result = buildInjection(baseRoutes, 300);
		expect(result.text).toContain("[CRP Router]");
		expect(result.text).toContain("Session rule:");
		expect(result.truncated).toBe(false);
		expect(result.droppedSkills).toBeEmpty();
	});

	test("buildInjection includes KG topics", () => {
		const routes: Routes = {
			version: 3,
			skills: [],
			kg: {
				topics: ["auth", "db"],
				query_command: "crp kg '<topic>'",
			},
		};

		const result = buildInjection(routes, 300);
		expect(result.text).toContain("auth");
		expect(result.text).toContain("db");
		expect(result.text).toContain("crp kg");
	});

	test("buildInjection sorts inline by frequency descending", () => {
		const routes: Routes = {
			version: 3,
			skills: [
				{ name: "low", strategy: "inline", freq: 0.1 },
				{ name: "high", strategy: "inline", freq: 0.9 },
				{ name: "mid", strategy: "inline", freq: 0.5 },
			],
		};

		const result = buildInjection(routes, 300);
		const inlineIdx = result.text.indexOf("Inline:");
		const inlineSection = result.text.slice(inlineIdx);
		expect(inlineSection.indexOf("high")).toBeLessThan(
			inlineSection.indexOf("mid"),
		);
		expect(inlineSection.indexOf("mid")).toBeLessThan(
			inlineSection.indexOf("low"),
		);
	});
});
