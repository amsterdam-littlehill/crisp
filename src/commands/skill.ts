import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getSkillSourceDirs, type SkillSource } from "../lib/crp/skill-source";
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

	// Search all source dirs for the skill directory
	const dirs = getSkillSourceDirs();
	let foundDir = "";
	for (const d of dirs) {
		const candidate = join(d.path, name);
		if (existsSync(candidate)) {
			foundDir = candidate;
			break;
		}
	}

	if (!foundDir) {
		console.error(`ERROR: Skill directory not found: ${name}`);
		return 1;
	}

	if (!options.force) {
		console.log(`Skill at: ${foundDir}`);
		console.log("Use --force to skip confirmation");
		return 0;
	}

	// Back up before deleting: user-level skills under .crp/backups/
	const projectDir = process.cwd();
	const backupDir = join(projectDir, ".crp", "backups", "skills", name);
	try {
		mkdirSync(backupDir, { recursive: true });
		cpSync(foundDir, backupDir, { recursive: true });
		console.log(`[BACKED UP] ${foundDir} → ${backupDir}`);
	} catch (e) {
		console.error(`ERROR: Backup failed: ${(e as Error).message}`);
		return 1;
	}

	rmSync(foundDir, { recursive: true, force: true });
	console.log(`[DELETED] ${foundDir}`);

	const skills = (manifest.skills || []).filter((s) => s.name !== name);
	manifest.skills = skills;
	if (manifest.default_skill === name) {
		manifest.default_skill = skills.length > 0 ? skills[0].name : null;
	}
	saveManifest("crp.yaml", manifest as CrpManifest);
	console.log(`[UNREGISTERED] '${name}' from crp.yaml`);

	return 0;
}

interface DiscoveredSkill {
	name: string;
	description: string;
	source: SkillSource;
	sourceLabel: string;
}

function scanAllSkillDirs(): DiscoveredSkill[] {
	const dirs = getSkillSourceDirs();
	const seen = new Set<string>();
	const found: DiscoveredSkill[] = [];
	for (const dir of dirs) {
		try {
			const entries = readdirSync(dir.path, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (seen.has(entry.name)) continue;
				seen.add(entry.name);
				let description = "";
				try {
					const mdPath = join(dir.path, entry.name, "SKILL.md");
					const content = readFileSync(mdPath, "utf-8");
					const firstLine = content.split("\n")[0] || "";
					description = firstLine.replace(/^#+\s*/, "").slice(0, 50);
				} catch {
					// ignore
				}
				found.push({
					name: entry.name,
					description,
					source: dir.source,
					sourceLabel: dir.label,
				});
			}
		} catch {
			// directory doesn't exist
		}
	}
	return found;
}

export function cmdSkillList(): number {
	const manifest = loadManifest("crp.yaml");
	if (!manifest.project) {
		console.error("ERROR: No crp.yaml found. Run 'crp init' first.");
		return 1;
	}

	const registeredSkills = new Map<string, string>();
	for (const s of manifest.skills || []) {
		registeredSkills.set(s.name, s.description || "");
	}

	const dirSkills = scanAllSkillDirs();
	const allNames = new Set<string>();
	for (const name of registeredSkills.keys()) allNames.add(name);
	for (const s of dirSkills) allNames.add(s.name);

	if (allNames.size === 0) {
		console.log("No skills found in any source directory.");
		console.log("Use 'crp skill create <name>' to add a project-level skill.");
		return 0;
	}

	const defaultSkill = manifest.default_skill || "";

	console.log(
		`\n${"Skill".padEnd(20)} ${"Default".padEnd(8)} ${"Registered".padEnd(12)} ${"Source".padEnd(16)} Description`,
	);
	console.log("-".repeat(90));
	for (const name of [...allNames].sort()) {
		const dirSkill = dirSkills.find((s) => s.name === name);
		const desc = registeredSkills.get(name) || dirSkill?.description || "";
		const isDefault = name === defaultSkill ? "*" : "";
		const isRegistered = registeredSkills.has(name) ? "yes" : "no";
		const sourceLabel =
			dirSkill?.sourceLabel ||
			(registeredSkills.has(name) ? "project" : "unknown");
		console.log(
			`${name.padEnd(20)} ${isDefault.padEnd(8)} ${isRegistered.padEnd(12)} ${sourceLabel.padEnd(16)} ${desc}`,
		);
	}
	console.log();
	return 0;
}
