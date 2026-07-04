import { existsSync } from "node:fs";
import { join } from "node:path";
import { emitJson, printError, printOk, printWarn } from "../lib/cli/format";
import { getSkillSourceDirs } from "../lib/crp/skill-source";
import { isSafeSkillName } from "../lib/skill/spec";
import { validateSkillAgainstSpec } from "../lib/skill/validate";

/**
 * `crp skill check <name>` — TS replacement for the deleted
 * `templates/skill/scripts/smoke-test.sh`. Runs validateSkillAgainstSpec
 * against the resolved skill directory and reports issues; exit 1 on any
 * error, 0 otherwise (warns do not fail).
 */
export function cmdSkillCheck(
	name: string,
	options: { json?: boolean } = {},
): number {
	if (!name) {
		if (options.json) {
			emitJson({
				name,
				valid: false,
				issues: [
					{
						severity: "error",
						code: "missing-name",
						message: "Skill name is required",
					},
				],
			});
			return 1;
		}
		printError(
			"Skill name is required",
			undefined,
			"Usage: crp skill check <name>",
		);
		return 1;
	}

	if (!isSafeSkillName(name)) {
		if (options.json) {
			emitJson({
				name,
				valid: false,
				issues: [
					{
						severity: "error",
						code: "invalid-name",
						message: `Invalid skill name: ${name}`,
					},
				],
			});
			return 1;
		}
		printError(
			`Invalid skill name: ${name}`,
			undefined,
			"Skill names must not contain path separators.",
		);
		return 1;
	}

	const dirs = getSkillSourceDirs();
	let skillDir = "";
	for (const d of dirs) {
		const candidate = join(d.path, name);
		if (existsSync(candidate)) {
			skillDir = candidate;
			break;
		}
	}

	if (!skillDir) {
		if (options.json) {
			emitJson({
				name,
				valid: false,
				issues: [
					{
						severity: "error",
						code: "not-found",
						message: `Skill directory not found: ${name}`,
					},
				],
			});
			return 1;
		}
		printError(
			`Skill directory not found: ${name}`,
			undefined,
			"Searched project .claude/skills and user-level skill dirs.",
		);
		return 1;
	}

	const issues = validateSkillAgainstSpec(skillDir);
	const errors = issues.filter((i) => i.severity === "error");
	const warns = issues.filter((i) => i.severity === "warn");
	const valid = errors.length === 0;

	if (options.json) {
		emitJson({ name, valid, issues });
		return valid ? 0 : 1;
	}

	if (issues.length === 0) {
		printOk(`Skill '${name}' passes all checks`);
		return 0;
	}
	for (const i of issues) {
		const tag = i.severity === "error" ? "FAIL" : "WARN";
		console.log(`  [${tag}] ${i.code}: ${i.message}`);
	}
	if (valid) {
		printWarn(`Skill '${name}' has ${warns.length} warning(s), 0 errors`);
		return 0;
	}
	printError(
		`Skill '${name}' has ${errors.length} error(s) and ${warns.length} warning(s)`,
	);
	return 1;
}
