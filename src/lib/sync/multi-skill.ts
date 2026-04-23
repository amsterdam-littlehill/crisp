import type { SkillEntry } from "../manifest/types";

function buildSkillTable(skills: SkillEntry[]): string[] {
	return skills.map((s) => `| ${s.name} | ${s.description || ""} |`);
}

export function generateSkillRoutingTable(
	skills: SkillEntry[],
	projectName: string,
): string {
	const dflt =
		skills.find((s) => (s as unknown as Record<string, unknown>).primary)
			?.name ||
		skills[0]?.name ||
		"";
	return [
		`# ${projectName} — Agent Skill Entry`,
		"",
		"Formal docs live under `.claude/skills/`. Read `.claude/skills/SKILL.md` first — it routes to the correct child skill.",
		"",
		"## Skill Routing (survives context truncation)",
		"",
		"| Skill | Description | Entry | Default |",
		"|-------|-------------|-------|---------|",
		...skills.map(
			(s) =>
				`| ${s.name} | ${s.description || ""} | \`${`.claude/skills/${s.name}/SKILL.md`}\` |`,
		),
		"",
		"## Auto-Route Rule",
		"",
		`1. **Default skill**: \`${dflt}\` — use unless task clearly matches another skill.`,
		"2. **Skill switching**: If task matches non-default skill, re-read that skill's SKILL.md for task-level routing.",
		"3. **Unknown tasks**: Use default skill; check if task belongs to another skill.",
		"",
		"## Session Discipline",
		"",
		"- Every new task must re-read `.claude/skills/SKILL.md` and re-match the skill route.",
		"- Then re-read the matched child skill's SKILL.md and follow its Common Tasks route.",
		"- Do not rely on memory across tasks.",
		"",
	].join("\n");
}

export function generateMultiSkillCursorRules(
	skills: SkillEntry[],
	projectName: string,
): string {
	return [
		`# ${projectName} — Workflow Rules`,
		"",
		"## Skill Routing",
		"",
		"| Skill | Description |",
		"|-------|-------------|",
		...buildSkillTable(skills),
		"",
		"## Mandatory",
		"",
		"1. Read `.claude/skills/SKILL.md` first for skill-level routing.",
		"2. Then read the matched child skill's SKILL.md for task-level routing.",
		"3. Run Closure Extraction before declaring any non-trivial task complete.",
		"",
	].join("\n");
}

export function generateMultiSkillGeminiMd(
	skills: SkillEntry[],
	projectName: string,
): string {
	return [
		`# ${projectName} — Gemini Entry`,
		"",
		"Read `.claude/skills/SKILL.md` first for skill-level routing. Then follow the child skill's routing.",
		"",
		"## Skill Routing",
		"",
		"| Skill | Description |",
		"|-------|-------------|",
		...buildSkillTable(skills),
		"",
		"## Session Refresh",
		"",
		"Every new task must re-read `.claude/skills/SKILL.md`, rematch skill route, then re-read child skill's SKILL.md.",
		"",
	].join("\n");
}

export function generateMultiSkillCodexInstructions(
	skills: SkillEntry[],
	projectName: string,
): string {
	return [
		`# ${projectName} — Codex Instructions`,
		"",
		"Agent context lives in `.claude/skills/`. Start by reading `.claude/skills/SKILL.md` for skill routing.",
		"",
		"## Skill Routing",
		"",
		"| Skill | Description |",
		"|-------|-------------|",
		...buildSkillTable(skills),
		"",
		"## Mandatory Checks",
		"",
		"- Re-read `.claude/skills/SKILL.md` at the start of every new task.",
		"- Then read the matched child skill's SKILL.md for task-level routing.",
		"- Run Closure Extraction (AAR) before marking any non-trivial task complete.",
		"",
	].join("\n");
}

export const MULTI_SKILL_GENERATORS: Record<
	string,
	(skills: SkillEntry[], pn: string) => string
> = {
	".claude/CLAUDE.md": generateSkillRoutingTable,
	".claude/GEMINI.md": generateMultiSkillGeminiMd,
	".codex/instructions.md": generateMultiSkillCodexInstructions,
	".cursor/rules/workflow.mdc": generateMultiSkillCursorRules,
};
