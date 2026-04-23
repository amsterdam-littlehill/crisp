import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { generateParentGateway } from "../lib/gateway/generator";
import { parseCommonTasks } from "../lib/gateway/parser";
import { loadManifest } from "../lib/manifest/io";
import type { SkillEntry } from "../lib/manifest/types";
import { MULTI_SKILL_GENERATORS } from "../lib/sync/multi-skill";
import { SHELL_GENERATORS } from "../lib/sync/shell-writers";

function normalizeName(name: string): string {
	const n = name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-");
	if (!n) throw new Error("Skill name cannot be empty after normalization");
	return n;
}

function writeParentGateway(content: string): string {
	const p = join(".claude", "skills", "SKILL.md");
	if (!existsSync(join(".claude", "skills")))
		mkdirSync(join(".claude", "skills"), { recursive: true });
	writeFileSync(p, content);
	return p;
}

function writeShells(
	generators: Record<
		string,
		(
			sn: string,
			pn: string,
			tasks: ReturnType<typeof parseCommonTasks>["tasks"],
		) => string
	>,
	skillName: string,
	projectName: string,
	tasks: ReturnType<typeof parseCommonTasks>["tasks"],
	check: boolean = false,
): number {
	let changed = 0;
	for (const [relPath, gen] of Object.entries(generators)) {
		const content = gen(skillName, projectName, tasks);
		if (check) {
			if (existsSync(relPath)) {
				const old = readFileSync(relPath, "utf-8");
				console.log(
					old.trim() !== content.trim()
						? `[WOULD CHANGE] ${relPath}`
						: `[UNCHANGED] ${relPath}`,
				);
				if (old.trim() !== content.trim()) changed++;
			} else {
				console.log(`[WOULD CREATE] ${relPath}`);
				changed++;
			}
		} else {
			mkdirSync(join(relPath, ".."), { recursive: true });
			writeFileSync(relPath, content);
			console.log(`[WRITTEN] ${relPath}`);
			changed++;
		}
	}
	return changed;
}

function writeMultiSkillShells(
	skills: SkillEntry[],
	projectName: string,
	check: boolean = false,
): number {
	let changed = 0;
	for (const [relPath, gen] of Object.entries(MULTI_SKILL_GENERATORS)) {
		const content = gen(skills, projectName);
		if (check) {
			if (existsSync(relPath)) {
				const old = readFileSync(relPath, "utf-8");
				console.log(
					old.trim() !== content.trim()
						? `[WOULD CHANGE] ${relPath}`
						: `[UNCHANGED] ${relPath}`,
				);
				if (old.trim() !== content.trim()) changed++;
			} else {
				console.log(`[WOULD CREATE] ${relPath}`);
				changed++;
			}
		} else {
			mkdirSync(join(relPath, ".."), { recursive: true });
			Bun.write(relPath, content);
			console.log(`[WRITTEN] ${relPath}`);
			changed++;
		}
	}
	return changed;
}

export async function runSync(
	skillName?: string,
	projectName?: string,
	check: boolean = false,
): Promise<number> {
	const manifest = loadManifest("crp.yaml");
	const hasManifest = Object.keys(manifest).length > 0;

	if (hasManifest) {
		const skills = manifest.skills || [];
		if (!skills.length) {
			console.error("ERROR: No skills defined in crp.yaml");
			return 1;
		}

		projectName = projectName || manifest.project?.name || "project";
		const gatewayContent = generateParentGateway(
			manifest as Parameters<typeof generateParentGateway>[0],
		);
		if (check) {
			const pp = join(".claude", "skills", "SKILL.md");
			if (existsSync(pp)) {
				const old = readFileSync(pp, "utf-8");
				console.log(
					old.trim() !== gatewayContent.trim()
						? "[WOULD CHANGE] .claude/skills/SKILL.md (parent gateway)"
						: "[UNCHANGED] .claude/skills/SKILL.md",
				);
			} else {
				console.log("[WOULD CREATE] .claude/skills/SKILL.md");
			}
		} else {
			const p = writeParentGateway(gatewayContent);
			console.log(`[WRITTEN] ${p}`);
		}

		let changed: number;
		if (skills.length === 1) {
			skillName = skillName || skills[0].name;
			const gwPath = join(".claude", "skills", skillName, "SKILL.md");
			if (!existsSync(gwPath)) {
				console.error(`ERROR: ${gwPath} not found. Run install.sh first.`);
				return 1;
			}
			const result = parseCommonTasks(gwPath);
			changed = writeShells(
				SHELL_GENERATORS,
				skillName,
				projectName,
				result.tasks,
				check,
			);
		} else {
			changed = writeMultiSkillShells(skills, projectName, check);
			if (skillName) {
				const gwPath = join(".claude", "skills", skillName, "SKILL.md");
				if (existsSync(gwPath)) {
					const result = parseCommonTasks(gwPath);
					changed += writeShells(
						SHELL_GENERATORS,
						skillName,
						projectName,
						result.tasks,
						check,
					);
				}
			}
		}

		if (check) {
			console.log(
				`\n${changed ? "DRY RUN" : "ALL CLEAN"}: ${changed} file(s) would change.`,
			);
			return changed ? 1 : 0;
		}
		const mode = skills.length === 1 ? "single-skill" : "multi-skill";
		console.log(
			`\n[OK] Synced ${changed} file(s) for ${mode} project: ${projectName}`,
		);
		return 0;
	}

	// Single-skill fallback (no manifest)
	if (!skillName) {
		const sd = join(".claude", "skills");
		if (existsSync(sd)) {
			const subs = readdirSync(sd, { withFileTypes: true }).filter(
				(d) => d.isDirectory() && d.name !== "shared",
			);
			if (subs.length === 1) skillName = subs[0].name;
		}
	}
	if (!skillName) {
		console.error(
			"ERROR: Could not auto-detect skill. Use --skill or create crp.yaml.",
		);
		return 1;
	}

	skillName = normalizeName(skillName);
	projectName = projectName || skillName;
	const gwPath = join(".claude", "skills", skillName, "SKILL.md");
	if (!existsSync(gwPath)) {
		console.error(`ERROR: ${gwPath} not found. Run install.sh first.`);
		return 1;
	}

	const result = parseCommonTasks(gwPath);
	if (!result.found) console.warn(`WARNING: ${result.message}`);
	if (!result.tasks.length)
		console.warn(
			"WARNING: No Common Tasks found. Shells will contain only fallback route.",
		);

	const changed = writeShells(
		SHELL_GENERATORS,
		skillName,
		projectName,
		result.tasks,
		check,
	);
	if (check) {
		console.log(
			`\n${changed ? "DRY RUN" : "ALL CLEAN"}: ${changed} file(s) would change.`,
		);
		return changed ? 1 : 0;
	}
	console.log(`\n[OK] Synced ${changed} shell file(s) from ${gwPath}`);
	return 0;
}
