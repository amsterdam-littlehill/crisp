import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CLAUDE_MD_MARKER_END,
	CLAUDE_MD_MARKER_START,
	generateClaudeMdContent,
	hasInjectionBlock,
	readClaudeMd,
	updateClaudeMd,
} from "../../src/lib/crp/claude-md";
import type { Routes } from "../../src/lib/crp/injection";
import type { CrpManifest } from "../../src/lib/manifest/types";

const testManifest: CrpManifest = {
	project: { name: "test-project" },
	skills: [],
	crp: {
		version: 3,
		session_inject: { max_tokens: 300, include_kg_index: true },
		tiers: { inline_threshold: 0.5, hint_threshold: 0.1 },
		telemetry: { window_days: 30 },
		kg: { max_query_tokens: 200, index_inline_tokens: 80 },
	},
};

const testRoutes: Routes = {
	version: 3,
	skills: [
		{ name: "backend", strategy: "inline", freq: 0.8 },
		{
			name: "frontend",
			strategy: "lazy",
			freq: 0.3,
			hint: 'Skill("frontend")',
		},
		{ name: "legacy", strategy: "dead", freq: 0.05 },
	],
};

describe("generateClaudeMdContent", () => {
	test("wraps injection text with markers", () => {
		const content = generateClaudeMdContent(testRoutes, testManifest);
		expect(content.includes(CLAUDE_MD_MARKER_START)).toBe(true);
		expect(content.includes(CLAUDE_MD_MARKER_END)).toBe(true);
		expect(content.includes("[CRP Router]")).toBe(true);
		expect(content.includes("backend")).toBe(true);
	});

	test("includes inline skills", () => {
		const content = generateClaudeMdContent(testRoutes, testManifest);
		expect(content.includes("Inline:")).toBe(true);
		expect(content.includes("backend")).toBe(true);
	});

	test("includes lazy skills", () => {
		const content = generateClaudeMdContent(testRoutes, testManifest);
		expect(content.includes("On-demand:")).toBe(true);
		expect(content.includes("frontend")).toBe(true);
	});
});

describe("hasInjectionBlock", () => {
	test("returns true when both markers present", () => {
		const content = `# My Project\n${CLAUDE_MD_MARKER_START}\ncontent\n${CLAUDE_MD_MARKER_END}`;
		expect(hasInjectionBlock(content)).toBe(true);
	});

	test("returns false when no markers", () => {
		const content = "# My Project\nJust regular markdown";
		expect(hasInjectionBlock(content)).toBe(false);
	});

	test("returns false when only start marker", () => {
		const content = `# My Project\n${CLAUDE_MD_MARKER_START}\ncontent`;
		expect(hasInjectionBlock(content)).toBe(false);
	});

	test("returns false for empty string", () => {
		expect(hasInjectionBlock("")).toBe(false);
	});
});

describe("updateClaudeMd", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `crp-claude-md-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("creates new CLAUDE.md when none exists", () => {
		const result = updateClaudeMd(tempDir, testRoutes, testManifest);
		expect(result.created).toBe(true);
		expect(result.updated).toBe(false);

		const content = readClaudeMd(tempDir);
		expect(content).not.toBeNull();
		expect(hasInjectionBlock(content ?? "")).toBe(true);
	});

	test("preserves user content when updating existing markers", () => {
		const claudeMdPath = join(tempDir, "CLAUDE.md");
		const userContent = "# My Project\n\nThis is my project description.\n\n";
		writeFileSync(
			claudeMdPath,
			`${userContent}${CLAUDE_MD_MARKER_START}\nold content\n${CLAUDE_MD_MARKER_END}\n`,
			"utf-8",
		);

		const result = updateClaudeMd(tempDir, testRoutes, testManifest);
		expect(result.created).toBe(false);
		expect(result.updated).toBe(true);

		const content = readClaudeMd(tempDir);
		expect(content).not.toBeNull();
		expect(content?.includes("My Project")).toBe(true);
		expect(content?.includes("project description")).toBe(true);
		expect(content?.includes("[CRP Router]")).toBe(true);
		expect(content?.includes("old content")).toBe(false);
	});

	test("appends injection block when no markers exist", () => {
		const claudeMdPath = join(tempDir, "CLAUDE.md");
		writeFileSync(claudeMdPath, "# My Project\n\nJust content.\n", "utf-8");

		const result = updateClaudeMd(tempDir, testRoutes, testManifest);
		expect(result.created).toBe(false);
		expect(result.updated).toBe(true);

		const content = readClaudeMd(tempDir);
		expect(content).not.toBeNull();
		expect(content?.includes("Just content.")).toBe(true);
		expect(hasInjectionBlock(content ?? "")).toBe(true);
	});

	test("returns updated=false when content unchanged", () => {
		updateClaudeMd(tempDir, testRoutes, testManifest);
		const result = updateClaudeMd(tempDir, testRoutes, testManifest);
		expect(result.updated).toBe(false);
	});
});

describe("readClaudeMd", () => {
	test("returns null when CLAUDE.md does not exist", () => {
		const tempDir = join(tmpdir(), `crp-claude-md-nonexist-${Date.now()}`);
		const result = readClaudeMd(tempDir);
		expect(result).toBeNull();
	});
});
