import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, saveManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";
import { copySkillTemplate } from "../lib/templates/copy";

function validateSkillName(name: string): string {
	if (!name) throw new Error("Skill name cannot be empty");
	if (/[./\\]/.test(name)) throw new Error(`Invalid skill name: ${name}`);
	const normalized = name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-");
	if (!normalized)
		throw new Error("Skill name cannot be empty after normalization");
	return normalized;
}

export function cmdSkillCreate(options: {
	name: string;
	description?: string;
	primary?: boolean;
}): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		console.error("ERROR: No crp.yaml found. Run 'crp init' first.");
		return 1;
	}

	let name: string;
	try {
		name = validateSkillName(options.name);
	} catch (e) {
		console.error(`ERROR: ${(e as Error).message}`);
		return 1;
	}

	const description = options.description || "";
	const projectName = manifest.project.name || name;
	const skillDir = join(".claude", "skills", name);

	if (existsSync(skillDir)) {
		console.error(`ERROR: Skill directory already exists: ${skillDir}`);
		return 1;
	}

	copySkillTemplate(skillDir, name, description, projectName);
	console.log(`[CREATED] skill directory: ${skillDir}`);

	const skills = manifest.skills || [];
	if (skills.some((s) => s.name === name)) {
		console.warn(`WARNING: Skill '${name}' already in crp.yaml`);
	} else {
		skills.push({ name, description });
		manifest.skills = skills;
		if (skills.length === 1 || options.primary) {
			manifest.default_skill = name;
		}
		saveManifest("crp.yaml", manifest as CrpManifest);
		console.log(`[REGISTERED] '${name}' in crp.yaml`);
	}

	return 0;
}

export function cmdSkillDelete(options: {
	name: string;
	force?: boolean;
}): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		console.error("ERROR: No crp.yaml found.");
		return 1;
	}

	let name: string;
	try {
		name = validateSkillName(options.name);
	} catch (e) {
		console.error(`ERROR: ${(e as Error).message}`);
		return 1;
	}

	const skillDir = join(".claude", "skills", name);
	if (!existsSync(skillDir)) {
		console.error(`ERROR: Skill directory not found: ${skillDir}`);
		return 1;
	}

	if (!options.force) {
		console.log("Use --force to skip confirmation");
		return 0;
	}

	rmSync(skillDir, { recursive: true, force: true });
	console.log(`[DELETED] ${skillDir}`);

	const skills = (manifest.skills || []).filter((s) => s.name !== name);
	manifest.skills = skills;
	if (manifest.default_skill === name) {
		manifest.default_skill = skills.length > 0 ? skills[0].name : null;
	}
	saveManifest("crp.yaml", manifest as CrpManifest);
	console.log(`[UNREGISTERED] '${name}' from crp.yaml`);

	return 0;
}

export function cmdSkillList(): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		console.error("ERROR: No crp.yaml found. Run 'crp init' first.");
		return 1;
	}

	const skills = manifest.skills || [];
	const defaultSkill = manifest.default_skill || "";

	if (skills.length === 0) {
		console.log("No skills defined.");
		return 0;
	}

	console.log(
		`\n${"Skill".padEnd(20)} ${"Default".padEnd(8)} ${"Description"}`,
	);
	console.log("-".repeat(60));
	for (const skill of skills) {
		const name = skill.name || "";
		const desc = skill.description || "";
		const marker = name === defaultSkill ? "*" : "";
		console.log(`${name.padEnd(20)} ${marker.padEnd(8)} ${desc}`);
	}
	console.log();
	return 0;
}
