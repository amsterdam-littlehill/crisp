import {
	existsSync,
	readdirSync,
	readFileSync,
	type Stats,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getEncoding } from "js-tiktoken";

const DEFAULT_COST_PER_1M_TOKENS = 3.0;

let enc: ReturnType<typeof getEncoding> | null = null;
function getEnc() {
	if (!enc) {
		try {
			enc = getEncoding("cl100k_base");
		} catch {
			/* unavailable */
		}
	}
	return enc;
}

export function estimateTokens(
	text: string,
	useTiktoken: boolean = true,
): [number, string] {
	if (useTiktoken) {
		const encoder = getEnc();
		if (encoder) {
			try {
				return [encoder.encode(text).length, "[exact]"];
			} catch {
				/* fall through */
			}
		}
	}
	return [Math.floor(text.length / 4), "[estimated]"];
}

function walkFiles(dir: string): string[] {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const fp = join(dir, entry);
		let st: Stats;
		try {
			st = statSync(fp);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			out.push(...walkFiles(fp));
		} else if (entry.endsWith(".md") || entry.endsWith(".sh")) {
			out.push(fp);
		}
	}
	return out;
}

export function scanFiles(skillDir: string): Record<string, number> {
	const results: Record<string, number> = {};
	for (const f of walkFiles(skillDir).sort()) {
		const rel = f
			.slice(skillDir.length)
			.replace(/^[\\/]/, "")
			.replace(/\\/g, "/");
		const text = readFileSync(f, "utf-8");
		const [tokens] = estimateTokens(text);
		results[rel] = tokens;
	}
	return results;
}

export function parseAlwaysRead(gatewayPath: string): string[] {
	let content: string;
	try {
		content = readFileSync(gatewayPath, "utf-8");
	} catch {
		return [];
	}
	const files: string[] = [];
	let inSection = false;
	for (const line of content.split("\n")) {
		if (/##\s+Always Read/i.test(line)) {
			inSection = true;
			continue;
		}
		if (inSection && line.startsWith("##")) break;
		if (inSection) {
			const m = line.match(/`?rules\/([^`\s]+)`?/);
			if (m) files.push(`rules/${m[1]}`);
		}
	}
	return files;
}

export function parseCommonTasks(
	gatewayPath: string,
): Record<string, string[]> {
	let content: string;
	try {
		content = readFileSync(gatewayPath, "utf-8");
	} catch {
		return {};
	}
	const tasks: Record<string, string[]> = {};
	const sectionMatch = content.match(/##\s+Common Tasks.*?(\n##\s|Z)/is);
	if (!sectionMatch) return tasks;
	const lines = sectionMatch[0]
		.split("\n")
		.filter((l) => l.trim().startsWith("|"));
	for (const line of lines.slice(2)) {
		const cells = line
			.split("|")
			.map((c) => c.trim())
			.filter((c) => c);
		if (
			cells.length >= 3 &&
			cells[0].toLowerCase() !== "task" &&
			!cells[0].startsWith("<!--")
		) {
			const taskName = cells[0]
				.replace(/[^\w\s]/g, "")
				.trim()
				.toLowerCase()
				.replace(/\s+/g, "_");
			const refs = cells[1].match(/`([^`]+\.(?:md|mdc|sh|py))`/g) || [];
			tasks[taskName] = refs.map((r) => r.replace(/`/g, ""));
		}
	}
	return tasks;
}

export interface AuditSkillResult {
	skill_name: string;
	method: string;
	single_file_tokens: Record<string, number>;
	naive_all_tokens: number;
	l0_tokens: number;
	gateway_tokens: number;
	per_task_tokens: Record<string, number>;
	session_5rounds: {
		naive_total_tokens: number;
		crp_total_tokens: number;
		savings_percent: number;
	};
	cost_per_1m_tokens: number;
	cost_usd: { naive: number; crp: number; savings: number };
}

export function auditSkill(
	skillDir: string,
	skillName: string,
	useTiktoken: boolean = true,
	rounds: number = 5,
	scenario?: string[],
): AuditSkillResult {
	const gateway = join(skillDir, "SKILL.md");
	if (!existsSync(gateway)) throw new Error(`${gateway} not found`);

	const fileTokens = scanFiles(skillDir);
	const naiveTotal = Object.values(fileTokens).reduce((a, b) => a + b, 0);

	const l0Files = parseAlwaysRead(gateway);
	const l0Tokens = l0Files.reduce((sum, f) => sum + (fileTokens[f] || 0), 0);

	const gatewayContent = readFileSync(gateway, "utf-8");
	const [gatewayTokens, methodLabel] = estimateTokens(
		gatewayContent,
		useTiktoken,
	);

	const tasks = parseCommonTasks(gateway);
	const perTask: Record<string, number> = {};
	for (const [taskName, refs] of Object.entries(tasks)) {
		const taskSpecific = refs.reduce((sum, f) => sum + (fileTokens[f] || 0), 0);
		perTask[taskName] = l0Tokens + gatewayTokens + taskSpecific;
	}
	perTask.other_unlisted = l0Tokens + gatewayTokens;

	const defaultPattern = ["fix_bug", "add_feature", "other_unlisted"];
	const roundTasks =
		scenario ||
		Array.from(
			{ length: rounds },
			(_, i) => defaultPattern[i % defaultPattern.length],
		);

	const sessionNaive = naiveTotal * rounds;
	const sessionCrp = roundTasks.reduce(
		(sum, t) => sum + (perTask[t] || perTask.other_unlisted),
		0,
	);

	const costNaive = (sessionNaive / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS;
	const costCrp = (sessionCrp / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS;

	return {
		skill_name: skillName,
		method: methodLabel,
		single_file_tokens: fileTokens,
		naive_all_tokens: naiveTotal,
		l0_tokens: l0Tokens,
		gateway_tokens: gatewayTokens,
		per_task_tokens: perTask,
		session_5rounds: {
			naive_total_tokens: sessionNaive,
			crp_total_tokens: sessionCrp,
			savings_percent: sessionNaive
				? Math.round((1 - sessionCrp / sessionNaive) * 1000) / 10
				: 0,
		},
		cost_per_1m_tokens: DEFAULT_COST_PER_1M_TOKENS,
		cost_usd: {
			naive: Math.round(costNaive * 10000) / 10000,
			crp: Math.round(costCrp * 10000) / 10000,
			savings: Math.round((costNaive - costCrp) * 10000) / 10000,
		},
	};
}

export function runAudit(
	skillName: string | null,
	skills: Array<{ name: string }>,
	useTiktoken: boolean,
	report: boolean = false,
	rounds: number = 5,
	scenario?: string[],
): number {
	const skillsDir = ".claude/skills";

	if (skills.length === 1 || skillName) {
		const name = skillName || skills[0]?.name;
		if (!name) {
			console.log("ERROR: No skill specified");
			return 1;
		}
		const skillDir = join(skillsDir, name);
		const result = auditSkill(skillDir, name, useTiktoken, rounds, scenario);
		printSingleAudit(result, rounds);
		if (report) {
			writeFileSync(
				"benchmark-report.json",
				`${JSON.stringify(result, null, 2)}\n`,
				"utf-8",
			);
			console.log("\nReport written to benchmark-report.json");
		}
		return 0;
	}

	const allResults: Record<string, AuditSkillResult> = {};
	let totalNaive = 0;
	let totalCrp = 0;
	for (const skill of skills) {
		const skillDir = join(skillsDir, skill.name);
		if (!existsSync(skillDir)) {
			console.log(`WARNING: Skill directory not found: ${skillDir}`);
			continue;
		}
		const result = auditSkill(
			skillDir,
			skill.name,
			useTiktoken,
			rounds,
			scenario,
		);
		allResults[skill.name] = result;
		totalNaive += result.session_5rounds.naive_total_tokens;
		totalCrp += result.session_5rounds.crp_total_tokens;
	}

	const combinedSavings = totalNaive
		? Math.round((1 - totalCrp / totalNaive) * 1000) / 10
		: 0;
	console.log(
		`\n== Multi-Skill Token Audit (${Object.keys(allResults).length} skills) ==\n`,
	);
	console.log(`Naive total:    ${totalNaive.toLocaleString()} tokens`);
	console.log(`CRP total:      ${totalCrp.toLocaleString()} tokens`);
	console.log(`Combined savings: ${combinedSavings}%`);

	if (report) {
		writeFileSync(
			"benchmark-report.json",
			`${JSON.stringify(
				{
					combined_analysis: {
						total_skills: Object.keys(allResults).length,
						naive_total_tokens: totalNaive,
						crp_total_tokens: totalCrp,
						savings_percent: combinedSavings,
					},
					individual_skills: allResults,
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
		console.log("\nReport written to benchmark-report.json");
	}
	return 0;
}

function printSingleAudit(result: AuditSkillResult, rounds: number): void {
	console.log(`\n== Token Audit: ${result.skill_name} ==\n`);
	console.log(`Estimation method: ${result.method}`);
	console.log(
		`Naive load (all files):     ${result.naive_all_tokens.toLocaleString()} tokens`,
	);
	console.log(
		`L0 (Always Read):           ${result.l0_tokens.toLocaleString()} tokens`,
	);
	console.log(
		`L2 (Gateway/SKILL.md):      ${result.gateway_tokens.toLocaleString()} tokens`,
	);
	console.log("\nPer-task CRP load:");
	for (const [task, tokens] of Object.entries(result.per_task_tokens)) {
		console.log(
			`  ${task.padEnd(20)} ${tokens.toLocaleString().padStart(8)} tokens`,
		);
	}
	const sr = result.session_5rounds;
	console.log(`\n${rounds}-round session simulation:`);
	console.log(
		`  Naive total:  ${sr.naive_total_tokens.toLocaleString()} tokens`,
	);
	console.log(`  CRP total:    ${sr.crp_total_tokens.toLocaleString()} tokens`);
	console.log(`  Savings:      ${sr.savings_percent}%`);
	const c = result.cost_usd;
	console.log(
		`\nEstimated input cost (Claude Sonnet 4.6, $${DEFAULT_COST_PER_1M_TOKENS}/1M tokens):`,
	);
	console.log(`  Naive: $${c.naive.toFixed(4)}`);
	console.log(`  CRP:   $${c.crp.toFixed(4)}`);
	console.log(`  Saved: $${c.savings.toFixed(4)}`);
}
