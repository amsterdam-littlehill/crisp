import { existsSync } from "node:fs";
import type { CrpManifest } from "../manifest/types";
import type { SkillFrequency } from "./analyzer";
import { compressSkill } from "./compressor";
import type { RouteSkill, Routes } from "./injection";
import { buildInjection, estimateTokens } from "./injection";

export interface GenerateRoutesOptions {
	inlineThreshold?: number;
	hintThreshold?: number;
}

export function generateRoutes(
	manifest: CrpManifest,
	frequencies: SkillFrequency[],
	kgTopics: string[] = [],
	options?: GenerateRoutesOptions,
): Routes {
	const inlineThreshold =
		options?.inlineThreshold ?? manifest.crp?.tiers?.inline_threshold ?? 0.5;
	const hintThreshold =
		options?.hintThreshold ?? manifest.crp?.tiers?.hint_threshold ?? 0.1;

	const skills: RouteSkill[] = [];

	for (const freq of frequencies) {
		let strategy: "inline" | "lazy" | "dead";
		if (freq.freq >= inlineThreshold) {
			strategy = "inline";
		} else if (freq.freq >= hintThreshold) {
			strategy = "lazy";
		} else {
			strategy = "dead";
		}

		const routeSkill: RouteSkill = {
			name: freq.name,
			strategy,
			freq: Math.round(freq.freq * 100) / 100,
		};

		if (strategy === "inline") {
			const skillPath = findSkillPath(freq.name);
			if (skillPath) {
				const summary = compressSkill(skillPath);
				if (summary.summary) {
					routeSkill.summary = summary.summary;
				}
			}
		} else if (strategy === "lazy") {
			routeSkill.hint = `Skill("${freq.name}")`;
		}

		skills.push(routeSkill);
	}

	const routes: Routes = {
		version: 3,
		skills,
	};

	if (kgTopics.length > 0) {
		routes.kg = {
			topics: kgTopics,
			query_command: "crp kg '<topic>'",
		};
	}

	// Pre-compute injection token count
	const injection = buildInjection(routes);
	routes.l0_inject_tokens = estimateTokens(injection.text);

	return routes;
}

function findSkillPath(skillName: string): string | null {
	const paths = [
		`.claude/skills/${skillName}.skill.md`,
		`.claude/skills/${skillName}/SKILL.md`,
	];
	for (const p of paths) {
		if (existsSync(p)) return p;
	}
	return null;
}
