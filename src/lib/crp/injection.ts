import { estimateTokens, freeEncoder } from "../tokens";

export { estimateTokens, freeEncoder };

export interface RouteSkill {
	name: string;
	strategy: "inline" | "lazy" | "dead";
	freq: number;
	source?: "project" | "user";
	summary?: string;
	hint?: string;
}

export interface Routes {
	version: number;
	skills: RouteSkill[];
	kg?: {
		topics?: string[];
		query_command?: string;
	};
	l0_inject_tokens?: number;
}

export interface InjectionResult {
	text: string;
	truncated: boolean;
	droppedSkills: string[];
}

interface SkillItem {
	name: string;
	text: string;
}

export function buildInjection(
	routes: Routes,
	maxTokens: number = 300,
): InjectionResult {
	const droppedSkills: string[] = [];
	let truncated = false;

	const inline = routes.skills
		.filter((s) => s.strategy === "inline")
		.sort((a, b) => b.freq - a.freq)
		.map(
			(s): SkillItem => ({
				name: s.name,
				text: s.summary ? `${s.name} (${s.summary})` : s.name,
			}),
		);

	const lazy = routes.skills
		.filter((s) => s.strategy === "lazy")
		.sort((a, b) => b.freq - a.freq)
		.map(
			(s): SkillItem => ({
				name: s.name,
				text: `${s.name} (${s.hint || `Skill("${s.name}")`})`,
			}),
		);

	const dead = routes.skills
		.filter((s) => s.strategy === "dead")
		.sort((a, b) => b.freq - a.freq)
		.map(
			(s): SkillItem => ({
				name: s.name,
				text: s.name,
			}),
		);

	const parts: string[] = ["[CRP Router]"];

	if (inline.length > 0)
		parts.push(`Inline: ${inline.map((i) => i.text).join(", ")}.`);
	if (lazy.length > 0)
		parts.push(`On-demand: ${lazy.map((i) => i.text).join(", ")}.`);
	if (dead.length > 0)
		parts.push(`Dead candidate: ${dead.map((i) => i.text).join(", ")}.`);

	if (routes.kg?.topics?.length) {
		const topics = routes.kg.topics.join(", ");
		const cmd = routes.kg.query_command || "crp kg '<topic>'";
		parts.push(`KG: Topics: ${topics}. Query via ${cmd}.`);
	}

	parts.push(
		"Session rule: re-read this block per task; do not assume context from prior tasks.",
	);

	function currentTokenCount(): number {
		return estimateTokens(parts.join("\n"));
	}

	if (currentTokenCount() <= maxTokens) {
		return { text: parts.join("\n"), truncated: false, droppedSkills: [] };
	}

	truncated = true;

	// Drop dead candidates (lowest priority)
	while (dead.length > 0 && currentTokenCount() > maxTokens) {
		const removed = dead.pop();
		if (!removed) break;
		droppedSkills.push(removed.name);
		const idx = parts.findIndex((p) => p.startsWith("Dead candidate:"));
		if (idx >= 0) {
			if (dead.length === 0) {
				parts.splice(idx, 1);
			} else {
				parts[idx] = `Dead candidate: ${dead.map((i) => i.text).join(", ")}.`;
			}
		}
	}

	// Drop lazy skills
	while (lazy.length > 0 && currentTokenCount() > maxTokens) {
		const removed = lazy.pop();
		if (!removed) break;
		droppedSkills.push(removed.name);
		const idx = parts.findIndex((p) => p.startsWith("On-demand:"));
		if (idx >= 0) {
			if (lazy.length === 0) {
				parts.splice(idx, 1);
			} else {
				parts[idx] = `On-demand: ${lazy.map((i) => i.text).join(", ")}.`;
			}
		}
	}

	// Drop inline skills (lowest freq first = end of array)
	while (inline.length > 0 && currentTokenCount() > maxTokens) {
		const removed = inline.pop();
		if (!removed) break;
		droppedSkills.push(removed.name);
		const idx = parts.findIndex((p) => p.startsWith("Inline:"));
		if (idx >= 0) {
			if (inline.length === 0) {
				parts.splice(idx, 1);
			} else {
				parts[idx] = `Inline: ${inline.map((i) => i.text).join(", ")}.`;
			}
		}
	}

	// Drop KG if still over limit
	if (currentTokenCount() > maxTokens) {
		const kgIdx = parts.findIndex((p) => p.startsWith("KG:"));
		if (kgIdx >= 0) {
			parts.splice(kgIdx, 1);
		}
	}

	return { text: parts.join("\n"), truncated, droppedSkills };
}
