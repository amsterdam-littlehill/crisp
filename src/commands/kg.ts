import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateKnowledgeGraph } from "../lib/kg/generator";
import { validateKg } from "../lib/kg/validator";
import { loadManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";
import { getSkillSourceDirs } from "../lib/crp/skill-source";

function findSkillDir(name: string): string | null {
	const dirs = getSkillSourceDirs();
	for (const d of dirs) {
		const candidate = join(d.path, name);
		try {
			statSync(candidate);
			return candidate;
		} catch {
			// try next
		}
	}
	return null;
}

export function cmdKgSync(options: { skill?: string | null }): number {
	const manifest = loadManifest("crp.yaml");
	const skills = manifest.skills || [];

	const targetSkills = options.skill
		? skills.filter((s) => s.name === options.skill)
		: skills;

	if (targetSkills.length === 0) {
		console.error("ERROR: No skills found to sync KG for.");
		return 1;
	}

	let anySuccess = false;
	for (const skill of targetSkills) {
		const skillDir = findSkillDir(skill.name);
		if (!skillDir) {
			console.warn(`WARNING: Skill directory not found for: ${skill.name}`);
			continue;
		}
		console.log(`\n== Generating KG: ${skill.name} (${skillDir}) ==`);
		const kg = generateKnowledgeGraph(skillDir, manifest as CrpManifest);
		const outPath = join(skillDir, ".crp-kg.json");
		writeFileSync(outPath, `${JSON.stringify(kg, null, 2)}\n`, "utf-8");
		console.log(`[WRITTEN] ${outPath}`);
		anySuccess = true;
	}

	if (!anySuccess) {
		console.error(
			"ERROR: No skills could be processed. Ensure skill directories exist under .claude/skills/ or ~/.claude/skills/",
		);
		return 1;
	}

	return 0;
}

export function cmdKgValidate(path: string): number {
	if (!existsSync(path)) {
		console.error(`ERROR: File not found: ${path}`);
		return 1;
	}
	const kg = JSON.parse(readFileSync(path, "utf-8"));
	const errors = validateKg(kg);
	if (errors.length > 0) {
		for (const err of errors) {
			console.log(`[ERROR] ${err}`);
		}
		return 1;
	}
	console.log("[OK] KG is valid");
	return 0;
}
