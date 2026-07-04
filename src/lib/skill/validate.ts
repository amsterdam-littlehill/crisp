/**
 * validateSkillAgainstSpec — pure, in-process skill validation.
 *
 * Mirrors the structural guarantees of the deleted `smoke-test.sh` but driven
 * entirely by `SKILL_SPEC`. Returns an issues array; empty (of errors) means
 * the skill conforms. Author-TODO residues (FILL markers, unsubstituted
 * placeholders) are reported as warnings, NOT errors — a freshly generated
 * skill legitimately contains them until the author fills them in.
 *
 * See `docs/superpowers/specs/2026-07-04-adr-skill-spec.md` (Decisions 2 & 4).
 */

import {
	type Dirent,
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { join } from "node:path";
import { type Issue, SKILL_SPEC } from "./spec";

function isDirectory(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function walkFiles(dir: string): string[] {
	const out: string[] = [];
	let entries: Dirent[] = [];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		if (e.name === ".gitkeep") continue;
		const fp = join(dir, e.name);
		if (e.isDirectory()) {
			out.push(...walkFiles(fp));
		} else {
			out.push(fp);
		}
	}
	return out;
}

export function validateSkillAgainstSpec(skillDir: string): Issue[] {
	const issues: Issue[] = [];

	for (const dir of SKILL_SPEC.requiredDirs) {
		if (!isDirectory(join(skillDir, dir.path))) {
			issues.push({
				severity: dir.severity,
				code: `missing-dir:${dir.path}`,
				message: `Required directory missing: ${dir.path}/`,
			});
		}
	}

	for (const f of [...SKILL_SPEC.rootFiles, ...SKILL_SPEC.requiredFiles]) {
		if (!existsSync(join(skillDir, f.path))) {
			issues.push({
				severity: f.severity,
				code: `missing-file:${f.path}`,
				message: `Required file missing: ${f.path}`,
			});
		}
	}

	let skillMd = "";
	try {
		skillMd = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
	} catch {
		// Already reported via missing-file:SKILL.md above.
	}
	if (skillMd) {
		for (const sec of SKILL_SPEC.requiredSkillMdSections) {
			if (!skillMd.includes(sec.needle)) {
				issues.push({
					severity: sec.severity,
					code: `missing-section:${sec.needle}`,
					message: `Required SKILL.md section missing: ${sec.needle}`,
				});
			}
		}
	}

	for (const f of SKILL_SPEC.forbiddenFiles) {
		if (existsSync(join(skillDir, f))) {
			issues.push({
				severity: "warn",
				code: `forbidden-file:${f}`,
				message: `Anti-template file present: ${f}`,
			});
		}
	}

	// Residue checks scan every file under the skill dir. These are author
	// TODOs (warn), not structural breakage (error), so a freshly scaffolded
	// skill still passes `crp skill check`.
	let placeholders = 0;
	let fills = 0;
	for (const fp of walkFiles(skillDir)) {
		let content = "";
		try {
			content = readFileSync(fp, "utf-8");
		} catch {
			continue;
		}
		for (const ph of SKILL_SPEC.placeholderResidues) {
			placeholders += Math.max(0, content.split(ph).length - 1);
		}
		fills += Math.max(
			0,
			content.split(SKILL_SPEC.fillMarkerPattern).length - 1,
		);
	}
	if (placeholders > 0) {
		issues.push({
			severity: "warn",
			code: "placeholder-residue",
			message: `${placeholders} unsubstituted placeholder(s) — run 'crp skill create' or replace {{NAME}}/{{PROJECT}} manually`,
		});
	}
	if (fills > 0) {
		issues.push({
			severity: "warn",
			code: "fill-marker-residue",
			message: `${fills} FILL marker(s) remaining — author TODO`,
		});
	}

	return issues;
}
