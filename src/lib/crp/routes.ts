import { existsSync } from "node:fs";
import type { CrpManifest } from "../manifest/types";
import type { SkillFrequency } from "./analyzer";
import { compressSkill } from "./compressor";
import type { RouteSkill, Routes } from "./injection";
import { buildInjection, estimateTokens } from "./injection";
import { getSkillSourceDirs } from "./skill-source";

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
		const isUserSkill = freq.source === "user";
		let strategy: "inline" | "lazy" | "dead";

		if (freq.sessions === 0) {
			// New skill with no telemetry data — treat as lazy (discoverable)
			strategy = "lazy";
		} else if (freq.freq >= inlineThreshold) {
			// User-level skills capped at lazy until explicitly registered as project
			strategy = isUserSkill ? "lazy" : "inline";
		} else if (freq.freq >= hintThreshold) {
			strategy = "lazy";
		} else {
			strategy = "dead";
		}

		const routeSkill: RouteSkill = {
			name: freq.name,
			strategy,
			freq: Math.round(freq.freq * 100) / 100,
			source: freq.source,
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
			const label = isUserSkill
				? `UserSkill("${freq.name}")`
				: `Skill("${freq.name}")`;
			routeSkill.hint = label;
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

export function findSkillPath(skillName: string): string | null {
	const dirs = getSkillSourceDirs();
	const candidates = [`${skillName}.skill.md`, `${skillName}/SKILL.md`];
	for (const dir of dirs) {
		for (const c of candidates) {
			const p = `${dir.path}/${c}`;
			if (existsSync(p)) return p;
		}
	}
	return null;
}
