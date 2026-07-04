/**
 * SkillSpec — single source of truth for "what a valid skill is".
 *
 * See `docs/superpowers/specs/2026-07-04-adr-skill-spec.md`.
 *
 * This const is consumed by:
 *   - `src/lib/kg/generator.ts` (`tierForPath` + `commonTasks` contract)
 *   - `src/lib/skill/validate.ts` (dirs/files/sections/residues)
 *
 * The shipped `templates/skill/` is canonical (Zone 1-7 layout). The spec is
 * aligned TO the template, not the reverse. The anti-drift test in
 * `tests/lib/skill/spec.test.ts` asserts that alignment holds.
 */

export type Severity = "error" | "warn";
export type Tier = "L0" | "L1" | "L2" | "L3";

export interface Issue {
	severity: Severity;
	code: string;
	message: string;
}

export interface DirSpec {
	path: string;
	severity: Severity;
}

export interface FileSpec {
	path: string;
	severity: Severity;
}

export interface SectionSpec {
	needle: string;
	severity: Severity;
}

export interface CommonTasksContract {
	/** RegExp source (without delimiters) matching the Common Tasks table. */
	headingRegex: string;
	/** Flags applied to headingRegex when constructed. */
	headingFlags: string;
	/** Lowercase display forms of the fallback row label. */
	fallbackTokens: string[];
	/** 1-based column index for the Must-read refs (`+`-joined). */
	mustReadColumn: number;
	/** 1-based column index for the Workflow refs (`+`-joined). */
	workflowColumn: number;
}

export interface SkillSpec {
	rootFiles: FileSpec[];
	requiredDirs: DirSpec[];
	requiredFiles: FileSpec[];
	requiredSkillMdSections: SectionSpec[];
	forbiddenFiles: string[];
	tierMap: Array<{ dir: string; tier: Tier }>;
	defaultTier: Tier;
	hotCacheAndSkillMdTier: Tier;
	commonTasks: CommonTasksContract;
	placeholderResidues: string[];
	fillMarkerPattern: string;
}

export const SKILL_SPEC: SkillSpec = {
	rootFiles: [{ path: "SKILL.md", severity: "error" }],
	requiredDirs: [
		{ path: "rules", severity: "error" },
		{ path: "workflows", severity: "error" },
		{ path: "references", severity: "error" },
		{ path: "scripts", severity: "error" },
		{ path: "assets", severity: "warn" },
		{ path: "skills/shared", severity: "warn" },
	],
	requiredFiles: [
		{ path: "rules/project-rules.md", severity: "error" },
		{ path: "rules/coding-standards.md", severity: "error" },
		{ path: "workflows/fix-bug.md", severity: "error" },
		{ path: "workflows/add-feature.md", severity: "error" },
		{ path: "workflows/update-rules.md", severity: "error" },
		{ path: "references/gotchas.md", severity: "error" },
	],
	// Zone 1-7 canonical sections. Legacy smoke-test names "Always Read" and
	// "Core Principles" are deliberately dropped (never in the template).
	requiredSkillMdSections: [
		{ needle: "Common Tasks", severity: "error" },
		{ needle: "Known Gotchas", severity: "error" },
		{ needle: "Verification", severity: "error" },
	],
	forbiddenFiles: [
		"README.md",
		"INSTALLATION_GUIDE.md",
		"CHANGELOG.md",
		"QUICK_REFERENCE.md",
	],
	tierMap: [
		{ dir: "rules", tier: "L1" },
		{ dir: "workflows", tier: "L2" },
		{ dir: "references", tier: "L3" },
	],
	defaultTier: "L2",
	hotCacheAndSkillMdTier: "L0",
	commonTasks: {
		// Byte-identical to the former inline `/##?\s*Common Tasks.*?(\|.*?\|.*)/is`.
		headingRegex: "##?\\s*Common Tasks.*?(\\|.*?\\|.*)",
		headingFlags: "is",
		fallbackTokens: ["Other / unlisted", "Other/unlisted", "other / unlisted"],
		mustReadColumn: 2,
		workflowColumn: 3,
	},
	placeholderResidues: ["{{NAME}}", "{{PROJECT}}"],
	fillMarkerPattern: "<!-- FILL:",
};

/**
 * Infer the knowledge-graph tier for a path relative to the skill directory.
 *
 * Reproduces the former inline `inferTier` map byte-for-byte:
 *   `_hot-cache.md` / `SKILL.md` -> L0
 *   `rules/...`                   -> L1
 *   `workflows/...`               -> L2
 *   `references/...`              -> L3
 *   anything else                 -> L2 (default)
 *
 * Accepts forward or backslash paths.
 */
export function tierForPath(relPath: string): Tier {
	const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
	const name = normalized.toLowerCase().replace(/^.*\//, "");
	if (name === "_hot-cache.md" || name === "skill.md") {
		return SKILL_SPEC.hotCacheAndSkillMdTier;
	}
	const parts = normalized.split("/");
	if (parts.length > 1) {
		const cat = parts[0].toLowerCase();
		for (const entry of SKILL_SPEC.tierMap) {
			if (cat === entry.dir) return entry.tier;
		}
	}
	return SKILL_SPEC.defaultTier;
}

/**
 * Parse the SKILL.md "Common Tasks" table into its data rows (as cell arrays),
 * skipping the header, separator, fallback, and comment rows. Pure: string in,
 * rows out. Shared by the KG generator (builds task_types + REQUIRES edges from
 * the refs) and skill validation (warns on refs that don't resolve to a file —
 * the generator silently drops those edges, so the author signal lives here).
 */
export function parseCommonTasksTable(content: string): string[][] {
	const ct = SKILL_SPEC.commonTasks;
	const tableMatch = content.match(
		new RegExp(ct.headingRegex, ct.headingFlags),
	);
	if (!tableMatch) return [];
	let tableText = tableMatch[1];
	const doubleNewline = tableText.indexOf("\n\n");
	if (doubleNewline !== -1) tableText = tableText.slice(0, doubleNewline);
	const lines = tableText.split("\n").filter((l) => l.trim().startsWith("|"));
	if (lines.length < 2) return [];
	const fallbackIds = new Set(
		ct.fallbackTokens.map((t) => t.toLowerCase().replace(/\s+/g, "-")),
	);
	const rows: string[][] = [];
	for (const line of lines.slice(2)) {
		const cols = line
			.split("|")
			.map((c) => c.trim())
			.filter((c) => c);
		if (cols.length < 2) continue;
		const taskName = cols[0].toLowerCase().replace(/\s+/g, "-");
		if (taskName.startsWith("<!--") || fallbackIds.has(taskName)) continue;
		rows.push(cols);
	}
	return rows;
}
