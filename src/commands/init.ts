import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { defaultManifest } from "../lib/manifest/defaults";
import { saveManifest } from "../lib/manifest/io";
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

function detectExistingSkill(): string | null {
	const skillsDir = join(".claude", "skills");
	if (!existsSync(skillsDir)) return null;
	let subdirs: string[];
	try {
		subdirs = readdirSync(skillsDir).filter((d: string) => {
			try {
				return statSync(join(skillsDir, d)).isDirectory() && d !== "shared";
			} catch {
				return false;
			}
		});
	} catch {
		return null;
	}
	return subdirs.length === 1 ? subdirs[0] : null;
}

function copyShells(
	skillName: string,
	projectName: string,
	shadow: boolean = false,
	dryRun: boolean = false,
): void {
	const shellMappings: Record<string, string> = {
		"templates/shells/CLAUDE.md": ".claude/CLAUDE.md",
		"templates/shells/GEMINI.md": ".claude/GEMINI.md",
		"templates/shells/.codex/instructions.md": ".codex/instructions.md",
		"templates/shells/.cursor/rules/workflow.mdc": ".cursor/rules/workflow.mdc",
	};

	for (const [srcRel, dstRel] of Object.entries(shellMappings)) {
		const src = join(import.meta.dirname, "..", "..", srcRel);
		const dst = dstRel;

		if (dryRun) {
			console.log(`  [DRY RUN] would copy: ${src} -> ${dst}`);
			continue;
		}
		if (shadow && existsSync(dst)) {
			console.log(`  [SHADOW] preserving existing ${dst}`);
			continue;
		}
		if (existsSync(src)) {
			mkdirSync(join(dst, ".."), { recursive: true });
			let text = readFileSync(src, "utf-8");
			text = text
				.replaceAll("{{NAME}}", skillName)
				.replaceAll("{{PROJECT}}", projectName || skillName);
			writeFileSync(dst, text, "utf-8");
			console.log(`  [COPIED] ${dst}`);
		}
	}
}

export function cmdInit(options: {
	fromExisting?: boolean;
	skill?: string;
	project?: string;
	shadow?: boolean;
	dryRun?: boolean;
}): number {
	const manifestPath = "crp.yaml";

	if (existsSync(manifestPath) && !options.fromExisting) {
		console.error(
			`ERROR: ${manifestPath} already exists. Use --from-existing to migrate.`,
		);
		return 1;
	}

	let skillName = options.skill || null;
	let projectName = options.project || skillName || "my-project";

	if (skillName) {
		try {
			skillName = validateSkillName(skillName);
		} catch (e) {
			console.error(`ERROR: ${(e as Error).message}`);
			return 1;
		}
	}

	let manifest: CrpManifest;

	if (options.fromExisting) {
		const existing = detectExistingSkill();
		if (!existing) {
			console.error(
				"ERROR: --from-existing requires a project with .claude/skills/<name>/",
			);
			return 1;
		}
		skillName = skillName || existing;
		projectName = options.project || skillName;
		manifest = defaultManifest(projectName);
		manifest.skills = [{ name: skillName, description: "" }];
		manifest.default_skill = skillName;
	} else {
		manifest = defaultManifest(projectName);
		if (skillName) {
			manifest.skills = [{ name: skillName, description: "" }];
			manifest.default_skill = skillName;
		}
	}

	if (options.dryRun) {
		console.log(`[DRY RUN] would create ${manifestPath}`);
	} else {
		saveManifest(manifestPath, manifest);
		console.log(`[CREATED] ${manifestPath}`);
	}

	if (skillName) {
		copyShells(skillName, projectName, options.shadow, options.dryRun);

		const sharedDir = join(".claude", "skills", "shared");
		if (!options.dryRun) {
			mkdirSync(sharedDir, { recursive: true });
			const gitkeep = join(sharedDir, ".gitkeep");
			if (!existsSync(gitkeep)) writeFileSync(gitkeep, "", "utf-8");
		}

		const skillDir = join(".claude", "skills", skillName);
		if (options.dryRun) {
			console.log(`  [DRY RUN] would copy skill template to ${skillDir}`);
		} else {
			copySkillTemplate(skillDir, skillName, "", projectName, options.shadow);
			console.log(`  [CREATED] skill: ${skillDir}`);
		}
	}

	console.log(`\nInit complete: ${projectName}`);
	if (skillName) {
		console.log(`   Skill: ${skillName}`);
		console.log(
			`   Edit .claude/skills/${skillName}/SKILL.md to customize routing.`,
		);
	}
	return 0;
}
