import { writeFileSync } from "node:fs";
export interface FileSize {
	name: string;
	lines: number;
	cnRatio: number;
}

const TOKEN_PER_CN_CHAR = 1.0;
const TOKEN_PER_EN_WORD = 1.3;
const AVG_CHARS_PER_LINE = 40;

const SKILL_FILES: Record<string, FileSize> = {
	"SKILL.md": { name: "SKILL.md", lines: 52, cnRatio: 0.6 },
	"project-rules.md": { name: "project-rules.md", lines: 120, cnRatio: 0.5 },
	"coding-standards.md": {
		name: "coding-standards.md",
		lines: 80,
		cnRatio: 0.4,
	},
	"gotchas.md": { name: "gotchas.md", lines: 60, cnRatio: 0.6 },
	"fix-bug.md": { name: "fix-bug.md", lines: 45, cnRatio: 0.6 },
	"add-feature.md": { name: "add-feature.md", lines: 50, cnRatio: 0.6 },
	"update-rules.md": { name: "update-rules.md", lines: 40, cnRatio: 0.6 },
	"smoke-test.sh": { name: "smoke-test.sh", lines: 120, cnRatio: 0.1 },
	"test-trigger.sh": { name: "test-trigger.sh", lines: 70, cnRatio: 0.1 },
};

const PRICING: Record<string, { input: number; output: number }> = {
	"claude-sonnet-4-6": { input: 3.0, output: 15.0 },
	"claude-haiku-4-5": { input: 0.8, output: 4.0 },
};

export function estimateTokens(f: FileSize): number {
	const totalChars = f.lines * AVG_CHARS_PER_LINE;
	const cnChars = Math.floor(totalChars * f.cnRatio);
	const enWords = Math.floor((totalChars * (1 - f.cnRatio)) / 5);
	return Math.floor(cnChars * TOKEN_PER_CN_CHAR + enWords * TOKEN_PER_EN_WORD);
}

export function naiveLoadAll(): number {
	return Object.values(SKILL_FILES).reduce(
		(sum, f) => sum + estimateTokens(f),
		0,
	);
}

export function skillBasedLoad(task: string): number {
	let total = estimateTokens(SKILL_FILES["SKILL.md"]);

	if (task === "fix_bug") {
		total += estimateTokens(SKILL_FILES["fix-bug.md"]);
		total += estimateTokens(SKILL_FILES["project-rules.md"]);
		total += estimateTokens(SKILL_FILES["coding-standards.md"]);
		total += Math.floor(estimateTokens(SKILL_FILES["gotchas.md"]) / 3);
	} else if (task === "add_feature") {
		total += estimateTokens(SKILL_FILES["add-feature.md"]);
		total += estimateTokens(SKILL_FILES["project-rules.md"]);
		total += estimateTokens(SKILL_FILES["coding-standards.md"]);
		total += Math.floor(estimateTokens(SKILL_FILES["gotchas.md"]) / 2);
	} else if (task === "multi_subtask") {
		total += estimateTokens(SKILL_FILES["update-rules.md"]);
		total += estimateTokens(SKILL_FILES["project-rules.md"]);
	} else if (task === "other") {
		total += estimateTokens(SKILL_FILES["project-rules.md"]);
		total += estimateTokens(SKILL_FILES["coding-standards.md"]);
	} else {
		total += estimateTokens(SKILL_FILES["project-rules.md"]);
	}

	return total;
}

export interface SessionResult {
	naive_total_tokens: number;
	skill_total_tokens: number;
	rounds: number;
}

export function sessionWithCompaction(
	rounds: number,
	taskPattern: string[],
): SessionResult {
	let naiveTotal = 0;
	let skillTotal = 0;
	const thinShell = 80;

	for (let i = 0; i < taskPattern.length; i++) {
		naiveTotal += naiveLoadAll();

		if (i === 0) {
			skillTotal += skillBasedLoad(taskPattern[i]);
		} else {
			skillTotal += thinShell + skillBasedLoad(taskPattern[i]);
		}
	}

	return {
		naive_total_tokens: naiveTotal,
		skill_total_tokens: skillTotal,
		rounds,
	};
}

export function runBenchmark(): void {
	console.log("=".repeat(60));
	console.log("Skill-Based Architecture — Token Cost Benchmark");
	console.log("=".repeat(60));
	console.log();

	console.log("[1/4] Single File Token Estimates");
	console.log("-".repeat(40));
	let singleTotal = 0;
	for (const [name, f] of Object.entries(SKILL_FILES)) {
		const tokens = estimateTokens(f);
		singleTotal += tokens;
		console.log(`  ${name.padEnd(25)} ${String(tokens).padStart(4)} tokens`);
	}
	console.log(
		`  ${"TOTAL".padEnd(25)} ${String(singleTotal).padStart(4)} tokens`,
	);
	console.log();

	console.log("[2/4] Per-Task Token Load (first round)");
	console.log("-".repeat(40));
	const naive = naiveLoadAll();
	console.log(`  Naive (load all):        ${String(naive).padStart(4)} tokens`);
	for (const task of ["fix_bug", "add_feature", "multi_subtask", "other"]) {
		const skill = skillBasedLoad(task);
		const saving = naive - skill;
		const pct = (saving / naive) * 100;
		console.log(
			`  Skill-based (${task.padEnd(12)}): ${String(skill).padStart(4)} tokens  ↓ ${String(saving).padStart(4)} (${Math.round(pct)}%)`,
		);
	}
	console.log();

	console.log("[3/4] Multi-Round Session (with context compaction)");
	console.log("-".repeat(40));
	const tasks = ["fix_bug", "add_feature", "fix_bug", "other", "add_feature"];
	const result = sessionWithCompaction(tasks.length, tasks);
	const naiveTotal = result.naive_total_tokens;
	const skillTotal = result.skill_total_tokens;
	const saving = naiveTotal - skillTotal;
	const pct = (saving / naiveTotal) * 100;
	console.log("  Scenario: 5 rounds, mixed tasks");
	console.log(`  Naive total:  ${String(naiveTotal).padStart(5)} tokens`);
	console.log(`  Skill total:  ${String(skillTotal).padStart(5)} tokens`);
	console.log(
		`  Saved:        ${String(saving).padStart(5)} tokens (${Math.round(pct)}%)`,
	);
	console.log();

	console.log("[4/4] Cost Estimation (Claude Sonnet 4.6)");
	console.log("-".repeat(40));
	const price = PRICING["claude-sonnet-4-6"].input;
	const naiveCost = (naiveTotal / 1_000_000) * price;
	const skillCost = (skillTotal / 1_000_000) * price;
	console.log(`  Naive input cost:  $${naiveCost.toFixed(4)}`);
	console.log(`  Skill input cost:  $${skillCost.toFixed(4)}`);
	console.log(
		`  Cost reduction:    ${Math.round(((naiveCost - skillCost) / naiveCost) * 100)}%`,
	);
	console.log();

	const report = {
		single_file_tokens: Object.fromEntries(
			Object.entries(SKILL_FILES).map(([name, f]) => [name, estimateTokens(f)]),
		),
		per_task: {
			naive_all: naive,
			skill_based: Object.fromEntries(
				["fix_bug", "add_feature", "multi_subtask", "other"].map((t) => [
					t,
					skillBasedLoad(t),
				]),
			),
		},
		session_5rounds: result,
		cost_usd: {
			naive: Math.round(naiveCost * 1_000_000) / 1_000_000,
			skill: Math.round(skillCost * 1_000_000) / 1_000_000,
		},
	};

	writeFileSync(
		"benchmark-report.json",
		`${JSON.stringify(report, null, 2)}\n`,
		"utf-8",
	);
	console.log("=".repeat(60));
	console.log("JSON report written to benchmark-report.json");
}
