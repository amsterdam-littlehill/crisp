import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateKnowledgeGraph } from "../lib/kg/generator";
import { validateKg } from "../lib/kg/validator";
import { loadManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";

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

	for (const skill of targetSkills) {
		const skillDir = join(".claude", "skills", skill.name);
		try {
			statSync(skillDir);
		} catch {
			console.warn(`WARNING: Skill directory not found: ${skillDir}`);
			continue;
		}
		console.log(`\n== Generating KG: ${skill.name} ==`);
		const kg = generateKnowledgeGraph(skillDir, manifest as CrpManifest);
		const outPath = join(skillDir, ".crp-kg.json");
		writeFileSync(outPath, `${JSON.stringify(kg, null, 2)}\n`, "utf-8");
		console.log(`[WRITTEN] ${outPath}`);
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
