import { readdirSync, readFileSync, type Stats, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadManifest } from "../manifest/io";
import type { CrpManifest, SkillEntry } from "../manifest/types";
import { computeQualityScore, isProductionReady } from "../quality/scorer";
import {
	checkDescriptionConsistency,
	checkEntryProxyDrift,
	checkManifestDrift,
	checkParentGatewayDrift,
} from "./drift";

const DEFAULT_MAX_GATEWAY_LINES = 100;
const DEFAULT_MAX_PROXY_LINES = 60;

const issues: string[] = [];
const warnings: string[] = [];
const infos: string[] = [];

function _emit(level: string, msg: string): void {
	if (level === "ERROR") issues.push(msg);
	else if (level === "WARNING") warnings.push(msg);
	else infos.push(msg);
	console.log(`  [${level}] ${msg}`);
}

export function emitFull(
	level: "ERROR" | "WARNING" | "INFO",
	problem: string,
	impact: string,
	fix: string,
): void {
	const fullMsg = `${problem}\n         Impact: ${impact}\n         Fix:    ${fix}`;
	if (level === "ERROR") issues.push(fullMsg);
	else if (level === "WARNING") warnings.push(fullMsg);
	else infos.push(fullMsg);
	console.log(`  [${level}] ${problem}`);
	console.log(`         Impact: ${impact}`);
	console.log(`         Fix:    ${fix}`);
}

export function clearIssues(): void {
	issues.length = 0;
	warnings.length = 0;
	infos.length = 0;
}

export function getIssueCounts(): {
	errors: number;
	warnings: number;
	infos: number;
} {
	return {
		errors: issues.length,
		warnings: warnings.length,
		infos: infos.length,
	};
}

export function checkFileSizes(
	skillDir: string,
	shells: string[],
	maxGateway: number = DEFAULT_MAX_GATEWAY_LINES,
	maxProxy: number = DEFAULT_MAX_PROXY_LINES,
): void {
	const gateway = join(skillDir, "SKILL.md");
	try {
		const lines = readFileSync(gateway, "utf-8").split("\n").length;
		if (lines > maxGateway) {
			emitFull(
				"ERROR",
				`gateway.md is ${lines} lines (> ${maxGateway})`,
				"Hard to fit in context window; routing table may be truncated",
				"Split into references/ directory",
			);
		} else if (lines > Math.floor(maxGateway * 0.8)) {
			emitFull(
				"WARNING",
				`gateway.md is ${lines} lines (approaching ${maxGateway} limit)`,
				"Near context limit; future additions may exceed threshold",
				"Plan splitting into references/",
			);
		}
	} catch {
		/* file doesn't exist, not an error for file size check */
	}

	for (const shell of shells) {
		try {
			const lines = readFileSync(shell, "utf-8").split("\n").length;
			if (lines > maxProxy) {
				emitFull(
					"ERROR",
					`${shell} is ${lines} lines (> ${maxProxy})`,
					"Shell no longer thin; loses 'survives truncation' property",
					"Run sync to regenerate thin shells",
				);
			} else if (lines > Math.floor(maxProxy * 0.75)) {
				emitFull(
					"WARNING",
					`${shell} is ${lines} lines (approaching ${maxProxy} limit)`,
					"Near proxy limit; future additions may exceed threshold",
					"Plan splitting or reduce routing table size",
				);
			}
		} catch {
			/* shell doesn't exist */
		}
	}

	function walk(dir: string): string[] {
		const out: string[] = [];
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return out;
		}
		for (const e of entries) {
			const fp = join(dir, e);
			let st: Stats;
			try {
				st = statSync(fp);
			} catch {
				continue;
			}
			if (st.isDirectory()) out.push(...walk(fp));
			else if (e.endsWith(".md")) out.push(fp);
		}
		return out;
	}

	for (const mdFile of walk(skillDir)) {
		const lines = readFileSync(mdFile, "utf-8").split("\n").length;
		if (lines > 500) {
			const rel = relative(skillDir, mdFile);
			emitFull(
				"WARNING",
				`${rel} is ${lines} lines (> 500)`,
				"Hard to navigate; increases context pressure",
				"Consider splitting into smaller files",
			);
		}
	}
}

export function checkLinkIntegrity(
	skillDir: string,
	projectRoot?: string,
): void {
	const root = projectRoot
		? resolve(projectRoot)
		: resolve(skillDir, "..", "..");

	function walk(dir: string): string[] {
		const out: string[] = [];
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return out;
		}
		for (const e of entries) {
			const fp = join(dir, e);
			let st: Stats;
			try {
				st = statSync(fp);
			} catch {
				continue;
			}
			if (st.isDirectory()) out.push(...walk(fp));
			else if (e.endsWith(".md")) out.push(fp);
		}
		return out;
	}

	for (const mdFile of walk(skillDir)) {
		const text = readFileSync(mdFile, "utf-8");
		const refs = text.matchAll(/`([^`]+\.(?:md|mdc|sh|py))`/g);
		for (const match of refs) {
			const ref = match[1];
			if (
				ref.startsWith("http://") ||
				ref.startsWith("https://") ||
				ref.startsWith("#")
			)
				continue;

			const target = resolve(skillDir, ref);
			try {
				if (!target.startsWith(root)) {
					const rel = relative(skillDir, mdFile);
					emitFull(
						"WARNING",
						`Suspicious link in ${rel}: \`${ref}\` escapes project directory`,
						"Potential path traversal or information disclosure",
						"Use a path within the project directory",
					);
					continue;
				}
			} catch {
				continue;
			}

			try {
				statSync(target);
			} catch {
				const rel = relative(skillDir, mdFile);
				emitFull(
					"ERROR",
					`Broken link in ${rel}: \`${ref}\` not found`,
					"Users see dead references; documentation rot",
					"Fix the link path or create the target file",
				);
			}
		}
	}
}

export function checkProxyLinkIntegrity(
	projectRoot: string,
	shells: string[],
): void {
	const skillsDir = join(projectRoot, ".claude", "skills");
	const skillDirs: string[] = [];
	try {
		for (const d of readdirSync(skillsDir)) {
			const fp = join(skillsDir, d);
			try {
				if (statSync(fp).isDirectory() && d !== "shared") skillDirs.push(fp);
			} catch {
				/* skip */
			}
		}
	} catch {
		/* skills dir doesn't exist */
	}

	for (const proxy of shells) {
		let text: string;
		try {
			text = readFileSync(proxy, "utf-8");
		} catch {
			continue;
		}
		const refs = text.matchAll(/`([^`]+\.(?:md|mdc|sh|py))`/g);
		for (const match of refs) {
			const ref = match[1];
			if (
				ref.startsWith("http://") ||
				ref.startsWith("https://") ||
				ref.startsWith("#")
			)
				continue;

			let found = false;
			const target = resolve(projectRoot, ref);
			try {
				if (target.startsWith(resolve(projectRoot))) {
					try {
						statSync(target);
						found = true;
					} catch {
						/* not found at project root */
					}
				}
			} catch {
				/* path escape */
			}

			if (!found) {
				for (const sdir of skillDirs) {
					const skillTarget = resolve(sdir, ref);
					try {
						if (skillTarget.startsWith(resolve(projectRoot))) {
							try {
								statSync(skillTarget);
								found = true;
								break;
							} catch {
								/* continue */
							}
						}
					} catch {
						/* path escape */
					}
				}
			}

			if (!found) {
				const rel = relative(projectRoot, resolve(proxy));
				emitFull(
					"ERROR",
					`Broken link in ${rel}: \`${ref}\` not found`,
					"Users see dead references; documentation rot",
					"Fix the link path or create the target file",
				);
			}
		}
	}
}

export function checkGotchasEmpty(skillDir: string): void {
	const gotchas = join(skillDir, "references", "gotchas.md");
	let text: string;
	try {
		text = readFileSync(gotchas, "utf-8");
	} catch {
		emitFull(
			"WARNING",
			"references/gotchas.md missing",
			"No gotchas reference for agents to consult",
			"Create an empty gotchas.md or remove reference",
		);
		return;
	}

	const contentLines = text.split("\n").filter((ln) => {
		const t = ln.trim();
		return (
			t &&
			!t.startsWith("#") &&
			!t.startsWith(">") &&
			!t.includes("FILL") &&
			!t.toLowerCase().includes("empty") &&
			!t.toLowerCase().includes("natural")
		);
	});

	if (contentLines.length > 3) {
		emitFull(
			"WARNING",
			`gotchas.md has ${contentLines.length} content lines — verify they are real pitfalls`,
			"Prefabricated examples reduce signal-to-noise",
			"Review and keep only genuine pitfalls; remove templated filler",
		);
	}
}

export function checkDeprecatedRules(skillDir: string): void {
	function walk(dir: string): string[] {
		const out: string[] = [];
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return out;
		}
		for (const e of entries) {
			const fp = join(dir, e);
			let st: Stats;
			try {
				st = statSync(fp);
			} catch {
				continue;
			}
			if (st.isDirectory()) out.push(...walk(fp));
			else if (e.endsWith(".md")) out.push(fp);
		}
		return out;
	}

	for (const mdFile of walk(skillDir)) {
		const text = readFileSync(mdFile, "utf-8");
		if (!text.includes("<!-- DEPRECATED")) continue;
		const dates = text.matchAll(/DEPRECATED:.*?(\d{4}-\d{2}-\d{2})/g);
		for (const m of dates) {
			try {
				const depDate = new Date(m[1]);
				const ageDays = Math.floor(
					(Date.now() - depDate.getTime()) / (1000 * 60 * 60 * 24),
				);
				if (ageDays > 30) {
					const rel = relative(skillDir, mdFile);
					emitFull(
						"WARNING",
						`${rel}: DEPRECATED marker from ${m[1]} (${ageDays} days old)`,
						"Stale markers confuse readers about current conventions",
						"Remove the deprecated section or update the marker date",
					);
				}
			} catch {
				/* invalid date */
			}
		}
	}
}

export function checkPlaceholders(skillDir: string, shells: string[]): void {
	const roots = [skillDir, ...shells];

	for (const root of roots) {
		let files: string[];
		try {
			const st = statSync(root);
			if (st.isFile()) {
				files = [root];
			} else if (st.isDirectory()) {
				files = [];
				function walk(dir: string): void {
					let entries: string[];
					try {
						entries = readdirSync(dir);
					} catch {
						return;
					}
					for (const e of entries) {
						const fp = join(dir, e);
						let s: Stats;
						try {
							s = statSync(fp);
						} catch {
							continue;
						}
						if (s.isDirectory()) walk(fp);
						else if (s.isFile()) files.push(fp);
					}
				}
				walk(root);
			} else {
				continue;
			}
		} catch {
			continue;
		}

		for (const f of files) {
			let text: string;
			try {
				text = readFileSync(f, "utf-8");
			} catch {
				continue;
			}
			if (text.includes("{{NAME}}") || text.includes("{{PROJECT}}")) {
				const rel = relative(".", f);
				emitFull(
					"ERROR",
					`Unreplaced placeholder in ${rel}: {{NAME}} or {{PROJECT}}`,
					"Incomplete setup; template values leaked to production",
					"Replace placeholders with actual project/skill names",
				);
			}
			const fillCount = (text.match(/<!-- FILL:/g) || []).length;
			if (fillCount > 0) {
				const rel = relative(".", f);
				emitFull(
					"WARNING",
					`${rel}: ${fillCount} FILL marker(s) remaining`,
					"Incomplete documentation; agents may skip required reads",
					"Complete all FILL sections or remove resolved markers",
				);
			}
		}
	}
}

export function runCheck(
	skillName: string | null,
	fix: boolean = false,
	drifts: boolean = false,
): number {
	clearIssues();
	let manifest: CrpManifest | null = null;
	try {
		manifest = loadManifest("crp.yaml") as CrpManifest;
	} catch {
		/* no manifest */
	}

	let maxGateway = DEFAULT_MAX_GATEWAY_LINES;
	let maxProxy = DEFAULT_MAX_PROXY_LINES;
	if (manifest?.checks) {
		maxGateway = manifest.checks.max_gateway_lines ?? DEFAULT_MAX_GATEWAY_LINES;
		maxProxy = manifest.checks.max_proxy_lines ?? DEFAULT_MAX_PROXY_LINES;
	}

	if (!skillName) {
		const skillsDir = join(".claude", "skills");
		try {
			const subdirs = readdirSync(skillsDir).filter((d) => {
				try {
					const st = statSync(join(skillsDir, d));
					return st.isDirectory() && d !== "shared";
				} catch {
					return false;
				}
			});
			if (subdirs.length === 1) skillName = subdirs[0];
			else if (manifest && subdirs.length > 1) skillName = subdirs[0] || null;
		} catch {
			/* no skills dir */
		}
	}

	if (drifts) {
		console.log("== Drift Detection ==\n");
		const driftedFiles: string[] = [];
		driftedFiles.push(...checkManifestDrift("crp.yaml"));
		if (manifest) {
			driftedFiles.push(...checkParentGatewayDrift(manifest));
			driftedFiles.push(...checkEntryProxyDrift(manifest));
			driftedFiles.push(...checkDescriptionConsistency(manifest));
		}
		console.log();

		if (fix && driftedFiles.length) {
			const unique = [...new Set(driftedFiles)].sort();
			console.log(`\n== Fix Mode: ${unique.length} drifted file(s) ==`);
			for (const f of unique) console.log(`  - ${f}`);
			console.log("\nRun `crp sync` to regenerate all drifted files.");
		}
	}

	if (!skillName) {
		console.log("ERROR: Could not auto-detect skill. Use --skill.");
		return 1;
	}

	const skillDir = join(".claude", "skills", skillName);
	try {
		statSync(skillDir);
	} catch {
		console.log(`ERROR: Skill directory not found: ${skillDir}`);
		return 1;
	}

	try {
		const resolved = resolve(skillDir);
		const cwd = resolve(".");
		if (!resolved.startsWith(cwd)) {
			console.log("ERROR: Skill path escapes project directory");
			return 1;
		}
	} catch {
		console.log("ERROR: Invalid skill path");
		return 1;
	}

	const shells = [
		join(".claude", "CLAUDE.md"),
		join(".claude", "GEMINI.md"),
		join(".codex", "instructions.md"),
		join(".cursor", "rules", "workflow.mdc"),
	];

	const projectRoot = resolve(".");
	const skillsToCheck: string[] = [];

	if (manifest?.skills?.length) {
		for (const s of manifest.skills) {
			const sdir = join(".claude", "skills", s.name);
			try {
				statSync(sdir);
				skillsToCheck.push(sdir);
			} catch {
				/* skip missing */
			}
		}
	} else {
		skillsToCheck.push(skillDir);
	}

	for (const sdir of skillsToCheck) {
		const name = sdir.replace(/^.*[\\/]/, "");
		console.log(`== Health Check: ${name} ==\n`);
		checkFileSizes(sdir, shells, maxGateway, maxProxy);
		checkLinkIntegrity(sdir, projectRoot);
		checkGotchasEmpty(sdir);
		checkDeprecatedRules(sdir);
		checkPlaceholders(sdir, shells);
	}

	checkProxyLinkIntegrity(projectRoot, shells);

	console.log("\n== Summary ==");
	console.log(`Errors:   ${issues.length}`);
	console.log(`Warnings: ${warnings.length}`);
	if (infos.length) console.log(`Infos:    ${infos.length}`);

	if (issues.length) {
		console.log("\n[FAIL] FAILED - fix errors before continuing");
		return 1;
	} else if (warnings.length) {
		console.log("\n[WARN] PASSED with warnings");
		return 0;
	} else {
		console.log("\n[OK] ALL CLEAR");
		return 0;
	}
}

export function cmdQualityScore(skillName: string | null): number {
	let manifest: CrpManifest;
	try {
		manifest = loadManifest("crp.yaml") as CrpManifest;
	} catch {
		console.log("ERROR: No crp.yaml found");
		return 1;
	}

	const skills = manifest.skills || [];
	const targetSkills = skillName
		? skills.filter((s: SkillEntry) => s.name === skillName)
		: skills;

	let exitCode = 0;
	for (const skill of targetSkills) {
		const skillDir = join(".claude", "skills", skill.name);
		try {
			statSync(skillDir);
		} catch {
			continue;
		}

		console.log(`\n== Quality Score: ${skill.name} ==`);

		function walk(dir: string): string[] {
			const out: string[] = [];
			let entries: string[];
			try {
				entries = readdirSync(dir);
			} catch {
				return out;
			}
			for (const e of entries) {
				const fp = join(dir, e);
				let st: Stats;
				try {
					st = statSync(fp);
				} catch {
					continue;
				}
				if (st.isDirectory()) out.push(...walk(fp));
				else if (e.endsWith(".md")) out.push(fp);
			}
			return out;
		}

		for (const mdFile of walk(skillDir).sort()) {
			const text = readFileSync(mdFile, "utf-8");
			const score = computeQualityScore(text);
			const rel = relative(skillDir, mdFile);
			const status = isProductionReady(score) ? "PASS" : "FAIL";
			if (status === "FAIL") exitCode = 1;
			console.log(`  [${status}] ${rel}: ${score.overall}/10`);
		}
	}

	return exitCode;
}
