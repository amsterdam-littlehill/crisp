import type { TaskEntry } from "../gateway/parser";

export function generateClaudeMd(
	skillName: string,
	projectName: string,
	_tasks: TaskEntry[],
): string {
	return (
		`# ${projectName} — CRP Entry\n\n` +
		`Read \`.claude/skills/${skillName}/SKILL.md\` first — ` +
		`default to \`primary: true\` skill; only switch when task clearly matches another.\n`
	);
}

function buildTaskTable(tasks: TaskEntry[]): string[] {
	const lines: string[] = [];
	const hasOther = tasks.some((t) => t.task.toLowerCase().includes("other"));
	for (const t of tasks)
		lines.push(`| ${t.task} | ${t.reads} | ${t.workflow} |`);
	if (!hasOther)
		lines.push(
			"| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
		);
	return lines;
}

export function generateCursorRules(
	_skillName: string,
	projectName: string,
	tasks: TaskEntry[],
): string {
	return [
		`# ${projectName} — Workflow Rules`,
		"",
		"## Quick Routing",
		"",
		"| Task | Required reads | Workflow |",
		"|------|---------------|----------|",
		...buildTaskTable(tasks),
		"",
		"## Mandatory",
		"",
		"1. Re-read `SKILL.md` on every new task — context compresses between tasks.",
		"2. Run Task Closure Protocol before declaring any non-trivial task complete.",
		`3. If you think "just this once I'll skip AAR" — STOP. Do the AAR.`,
		"",
	].join("\n");
}

export function generateGeminiMd(
	skillName: string,
	projectName: string,
	tasks: TaskEntry[],
): string {
	return [
		`# ${projectName} — Gemini Entry`,
		"",
		`Read \`.claude/skills/${skillName}/SKILL.md\` first. Then follow the routing table below.`,
		"",
		"## Quick Routing",
		"",
		"| Task | Required reads | Workflow |",
		"|------|---------------|----------|",
		...buildTaskTable(tasks),
		"",
		"## Session Refresh",
		"",
		"Every new task must re-read SKILL.md and rematch the Common Tasks route. Do not rely on memory across tasks.",
		"",
	].join("\n");
}

export function generateCodexInstructions(
	skillName: string,
	projectName: string,
	tasks: TaskEntry[],
): string {
	return [
		`# ${projectName} — Codex Instructions`,
		"",
		`Agent context lives in \`.claude/skills/${skillName}/\`. Start by reading \`SKILL.md\`.`,
		"",
		"## Quick Routing",
		"",
		"| Task | Required reads | Workflow |",
		"|------|---------------|----------|",
		...buildTaskTable(tasks),
		"",
		"## Mandatory Checks",
		"",
		"- Re-read `SKILL.md` at the start of every new task.",
		"- Run Task Closure Protocol (AAR) before marking any non-trivial task complete.",
		"",
	].join("\n");
}

export const SHELL_GENERATORS: Record<
	string,
	(sn: string, pn: string, t: TaskEntry[]) => string
> = {
	".claude/CLAUDE.md": generateClaudeMd,
	".claude/GEMINI.md": generateGeminiMd,
	".codex/instructions.md": generateCodexInstructions,
	".cursor/rules/workflow.mdc": generateCursorRules,
};
