import type { CrpManifest } from "./types";

export function validateManifest(data: Partial<CrpManifest>): string[] {
	const errors: string[] = [];

	if (typeof data !== "object" || Array.isArray(data) || data === null) {
		errors.push("Manifest must be a YAML mapping");
		return errors;
	}

	const project = data.project;
	if (project === undefined || project === null) {
		errors.push("Missing required field: project");
	} else if (typeof project !== "object" || Array.isArray(project)) {
		errors.push("project must be a mapping");
	} else {
		if (!project.name) {
			errors.push("project.name is required");
		}
	}

	const skills = data.skills;
	if (skills === undefined || skills === null) {
		errors.push("Missing required field: skills");
	} else if (!Array.isArray(skills)) {
		errors.push("skills must be a list");
	} else {
		const names = new Set<string>();
		for (let i = 0; i < skills.length; i++) {
			const skill = skills[i];
			if (typeof skill !== "object" || Array.isArray(skill) || skill === null) {
				errors.push(`skills[${i}] must be a mapping`);
				continue;
			}
			const name = skill.name;
			if (!name) {
				errors.push(`skills[${i}] missing 'name'`);
			} else if (typeof name !== "string") {
				errors.push(`skills[${i}].name must be a string`);
			} else if (names.has(name)) {
				errors.push(`Duplicate skill name: '${name}'`);
			} else {
				names.add(name);
			}
		}

		const defaultSkill = data.default_skill;
		if (
			defaultSkill !== undefined &&
			defaultSkill !== null &&
			!names.has(defaultSkill)
		) {
			errors.push(`default_skill '${defaultSkill}' not found in skills list`);
		}
	}

	const checks = data.checks;
	if (checks && typeof checks === "object" && !Array.isArray(checks)) {
		for (const key of ["max_gateway_lines", "max_proxy_lines"] as const) {
			const val = checks[key];
			if (
				val !== undefined &&
				val !== null &&
				(typeof val !== "number" || val <= 0 || !Number.isInteger(val))
			) {
				errors.push(`checks.${key} must be a positive integer`);
			}
		}
	}

	const audit = data.audit;
	if (audit && typeof audit === "object" && !Array.isArray(audit)) {
		const useTik = audit.use_tiktoken;
		if (
			useTik !== undefined &&
			useTik !== null &&
			typeof useTik !== "boolean"
		) {
			errors.push("audit.use_tiktoken must be a boolean");
		}
	}

	const kg = data.knowledge_graph;
	if (kg && typeof kg === "object" && !Array.isArray(kg)) {
		const enabled = kg.enabled;
		if (
			enabled !== undefined &&
			enabled !== null &&
			typeof enabled !== "boolean"
		) {
			errors.push("knowledge_graph.enabled must be a boolean");
		}

		for (const tokenField of [
			"max_tokens_execution",
			"max_tokens_synthesis",
			"max_tokens_cross_domain",
		] as const) {
			const val = kg[tokenField];
			if (
				val !== undefined &&
				val !== null &&
				(typeof val !== "number" || val <= 0 || !Number.isInteger(val))
			) {
				errors.push(`knowledge_graph.${tokenField} must be a positive integer`);
			}
		}

		const hotCache = kg.hot_cache_files;
		if (
			hotCache !== undefined &&
			hotCache !== null &&
			!Array.isArray(hotCache)
		) {
			errors.push("knowledge_graph.hot_cache_files must be a list");
		}
	}

	const budget = data.budget_audit;
	if (budget && typeof budget === "object" && !Array.isArray(budget)) {
		for (const tokenField of [
			"max_gateway_tokens",
			"max_entry_proxy_tokens",
			"max_rules_bloat_tokens",
		] as const) {
			const val = budget[tokenField];
			if (
				val !== undefined &&
				val !== null &&
				(typeof val !== "number" || val <= 0 || !Number.isInteger(val))
			) {
				errors.push(`budget_audit.${tokenField} must be a positive integer`);
			}
		}
	}

	return errors;
}
