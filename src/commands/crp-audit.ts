import { printError, printOk, printWarn } from "../lib/cli/format";
import { runCrpAudit } from "../lib/crp/audit";

export interface AuditOptions {
	json?: boolean;
}

export function cmdCrpAudit(options: AuditOptions = {}): number {
	const result = runCrpAudit();
	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
		return 0;
	}
	console.log("== CRP Audit ==\n");
	console.log(
		`L0 Injection: ${result.totalTokens} / ${result.maxTokens} tokens (${(result.tokenUsage * 100).toFixed(1)}%)\n`,
	);
	console.log("Tier distribution:");
	printOk(`  Inline: ${result.inlineCount}`);
	printWarn(`  Lazy:   ${result.lazyCount}`);
	printError(`  Dead:   ${result.deadCount}\n`);
	if (result.histogram.length > 0) {
		console.log("Frequency histogram (30 days):");
		for (const f of result.histogram) {
			const bar = "█".repeat(Math.round(f.freq * 20));
			console.log(
				`  ${f.name.padEnd(20)} ${bar} ${(f.freq * 100).toFixed(0)}%`,
			);
		}
		console.log();
	}
	if (result.deadCandidates.length > 0) {
		printWarn("Dead candidates (0 reads in 14 days):");
		for (const name of result.deadCandidates) printWarn(`  - ${name}`);
		console.log();
	}
	return 0;
}
