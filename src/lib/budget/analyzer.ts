import {
	existsSync,
	readdirSync,
	readFileSync,
	type Stats,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { loadManifest } from "../manifest/io";

export interface BudgetFinding {
	dimension: string;
	severity: string;
	message: string;
	file?: string | null;
	current_value?: number | null;
	threshold?: number | null;
}

function estimateTokens(text: string): number {
	return Math.floor(text.length / 4);
}

export function auditGatewaySize(
	skillDir: string,
	maxTokens: number = 1000,
): BudgetFinding[] {
	const findings: BudgetFinding[] = [];
	let totalTokens = 0;

	const hotCache = join(skillDir, "_hot-cache.md");
	if (existsSync(hotCache)) {
		totalTokens += estimateTokens(readFileSync(hotCache, "utf-8"));
	}

	const skillMd = join(skillDir, "SKILL.md");
	if (existsSync(skillMd)) {
		const content = readFileSync(skillMd, "utf-8");
		const lines = content.split("\n");
		let startIdx = 0;
		let inFrontmatter = false;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === "---") {
				if (inFrontmatter) {
					startIdx = i + 1;
					break;
				}
				inFrontmatter = true;
			}
		}

		let endIdx = lines.length;
		for (let i = startIdx; i < Math.min(startIdx + 50, lines.length); i++) {
			if (lines[i].includes("@hot-cache-end")) {
				endIdx = i;
				break;
			}
		}

		const intro = lines.slice(startIdx, endIdx).join("\n");
		totalTokens += estimateTokens(intro);
	}

	if (totalTokens > maxTokens) {
		const filePath = relative(process.cwd(), skillDir) || skillDir;
		findings.push({
			dimension: "gateway_size",
			severity: "WARNING",
			message: `Gateway size (${totalTokens} tokens) exceeds threshold (${maxTokens})`,
			file: filePath,
			current_value: totalTokens,
			threshold: maxTokens,
		});
	}

	return findings;
}

export function auditEntryProxySize(
	projectRoot: string,
	maxTokens: number = 200,
): BudgetFinding[] {
	const findings: BudgetFinding[] = [];

	const proxies = [
		join(projectRoot, ".claude", "CLAUDE.md"),
		join(projectRoot, ".claude", "GEMINI.md"),
		join(projectRoot, ".codex", "instructions.md"),
	];

	for (const proxy of proxies) {
		if (!existsSync(proxy)) continue;
		const tokens = estimateTokens(readFileSync(proxy, "utf-8"));
		if (tokens > maxTokens) {
			const name = proxy.replace(/^.*[\\/]/, "");
			findings.push({
				dimension: "entry_proxy_size",
				severity: "WARNING",
				message: `Entry proxy ${name} (${tokens} tokens) exceeds threshold (${maxTokens})`,
				file: relative(projectRoot, proxy),
				current_value: tokens,
				threshold: maxTokens,
			});
		}
	}

	return findings;
}

export function auditDescriptionLength(
	skillMd: string,
	maxWords: number = 30,
): BudgetFinding[] {
	const findings: BudgetFinding[] = [];

	if (!existsSync(skillMd)) return findings;

	const content = readFileSync(skillMd, "utf-8");
	const fmMatch = content.match(/^---\s*\n(.*?)\n---\s*\n/s);
	if (!fmMatch) return findings;

	const frontmatter = fmMatch[1];
	const descMatch = frontmatter.match(
		/^description:\s*([>|"']?-?\+?)\s*(.*)$/m,
	);
	if (!descMatch) return findings;

	const indicator = descMatch[1];
	let description = descMatch[2].trim();

	if (indicator.startsWith("|") || indicator.startsWith(">")) {
		const lines = frontmatter.split("\n");
		const descLineIdx = lines.findIndex((l) =>
			l.trim().startsWith("description:"),
		);
		if (descLineIdx !== -1) {
			const contentLines: string[] = [];
			let baseIndent: number | null = null;
			for (let i = descLineIdx + 1; i < lines.length; i++) {
				const stripped = lines[i].trimStart();
				if (!stripped) continue;
				const indent = lines[i].length - stripped.length;
				if (baseIndent === null) baseIndent = indent;
				if (indent >= baseIndent) {
					contentLines.push(stripped);
				} else {
					break;
				}
			}
			description = contentLines.join(" ");
		}
	} else if (description.startsWith('"') && description.endsWith('"')) {
		description = description.slice(1, -1);
	} else if (description.startsWith("'") && description.endsWith("'")) {
		description = description.slice(1, -1);
	}

	const wordCount = description.split(/\s+/).filter(Boolean).length;

	if (wordCount > maxWords) {
		findings.push({
			dimension: "description_length",
			severity: "WARNING",
			message: `Description (${wordCount} words) exceeds threshold (${maxWords})`,
			file: skillMd,
			current_value: wordCount,
			threshold: maxWords,
		});
	}

	return findings;
}

export function auditDuplicateContent(skillDir: string): BudgetFinding[] {
	const findings: BudgetFinding[] = [];
	const contentMap = new Map<string, string[]>();

	function walk(dir: string): void {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const e of entries) {
			const fp = join(dir, e);
			let st: Stats;
			try {
				st = statSync(fp);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				walk(fp);
			} else if (e.endsWith(".md") && !e.startsWith(".")) {
				const content = readFileSync(fp, "utf-8");
				const normalized = content.replace(/\s+/g, " ").trim();
				if (!contentMap.has(normalized)) {
					contentMap.set(normalized, []);
				}
				contentMap.get(normalized)?.push(relative(skillDir, fp));
			}
		}
	}

	walk(skillDir);

	for (const [, files] of contentMap) {
		if (files.length > 1) {
			findings.push({
				dimension: "duplicate_content",
				severity: "INFO",
				message: `Duplicate content found in ${files.length} files: ${files.join(", ")}`,
			});
			break;
		}
	}

	return findings;
}

export function auditRulesBlot(
	skillDir: string,
	maxTokens: number = 3000,
): BudgetFinding[] {
	const findings: BudgetFinding[] = [];
	let totalTokens = 0;

	const rulesDir = join(skillDir, "rules");
	if (!existsSync(rulesDir)) return findings;

	function walk(dir: string): void {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const e of entries) {
			const fp = join(dir, e);
			let st: Stats;
			try {
				st = statSync(fp);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				walk(fp);
			} else if (e.endsWith(".md")) {
				totalTokens += estimateTokens(readFileSync(fp, "utf-8"));
			}
		}
	}

	walk(rulesDir);

	if (totalTokens > maxTokens) {
		findings.push({
			dimension: "rules_bloat",
			severity: "WARNING",
			message: `Rules directory (${totalTokens} tokens) exceeds threshold (${maxTokens})`,
			file: rulesDir,
			current_value: totalTokens,
			threshold: maxTokens,
		});
	}

	return findings;
}

export function auditMcpToolCount(settingsPath: string): BudgetFinding[] {
	const findings: BudgetFinding[] = [];

	if (!existsSync(settingsPath)) return findings;

	try {
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const mcpServers = settings.mcpServers || {};
		let toolCount = 0;
		for (const server of Object.values(mcpServers) as Array<
			Record<string, unknown>
		>) {
			if (Array.isArray(server.tools)) {
				toolCount += (server.tools as unknown[]).length;
			} else {
				toolCount += 10;
			}
		}

		if (toolCount > 80) {
			findings.push({
				dimension: "mcp_tool_count",
				severity: "INFO",
				message: `MCP tools (${toolCount}) may impact context. This is informational only.`,
				current_value: toolCount,
				threshold: 80,
			});
		}
	} catch {
		// JSON parse error — skip
	}

	return findings;
}

export function runBudgetAudit(
	projectRoot: string,
	config: Record<string, number> = {},
): Record<string, unknown> {
	const allFindings: BudgetFinding[] = [];
	let totalTokens = 0;

	const skillsDir = join(projectRoot, ".claude", "skills");
	if (existsSync(skillsDir)) {
		let entries: string[];
		try {
			entries = readdirSync(skillsDir);
		} catch {
			entries = [];
		}
		for (const entry of entries) {
			const skillDir = join(skillsDir, entry);
			try {
				if (!statSync(skillDir).isDirectory() || entry === "shared") continue;
			} catch {
				continue;
			}

			allFindings.push(
				...auditGatewaySize(skillDir, config.max_gateway_tokens ?? 1000),
			);

			const skillMd = join(skillDir, "SKILL.md");
			allFindings.push(...auditDescriptionLength(skillMd));

			allFindings.push(...auditDuplicateContent(skillDir));

			allFindings.push(
				...auditRulesBlot(skillDir, config.max_rules_bloat_tokens ?? 3000),
			);
		}
	}

	allFindings.push(
		...auditEntryProxySize(projectRoot, config.max_entry_proxy_tokens ?? 200),
	);

	const settingsPath = join(projectRoot, ".claude", "settings.json");
	allFindings.push(...auditMcpToolCount(settingsPath));

	if (existsSync(skillsDir)) {
		let entries: string[];
		try {
			entries = readdirSync(skillsDir);
		} catch {
			entries = [];
		}
		for (const entry of entries) {
			const skillDir = join(skillsDir, entry);
			try {
				if (!statSync(skillDir).isDirectory() || entry === "shared") continue;
			} catch {
				continue;
			}

			function walk(dir: string): void {
				let subEntries: string[];
				try {
					subEntries = readdirSync(dir);
				} catch {
					return;
				}
				for (const e of subEntries) {
					const fp = join(dir, e);
					let st: Stats;
					try {
						st = statSync(fp);
					} catch {
						continue;
					}
					if (st.isDirectory()) {
						walk(fp);
					} else if (e.endsWith(".md")) {
						totalTokens += estimateTokens(readFileSync(fp, "utf-8"));
					}
				}
			}
			walk(skillDir);
		}
	}

	return {
		findings: allFindings.map((f) => ({
			dimension: f.dimension,
			severity: f.severity,
			message: f.message,
			file: f.file,
			current_value: f.current_value,
			threshold: f.threshold,
		})),
		total_tokens: totalTokens,
		summary: {
			warnings: allFindings.filter((f) => f.severity === "WARNING").length,
			infos: allFindings.filter((f) => f.severity === "INFO").length,
			notes: allFindings.filter((f) => f.severity === "NOTE").length,
		},
	};
}

export function runBudgetCmd(
	_skillName: string | null = null,
	report: boolean = false,
): number {
	const manifest = loadManifest("crp.yaml");
	const projectRoot = ".";

	const config: Record<string, number> = {
		max_gateway_tokens: manifest.budget_audit?.max_gateway_tokens ?? 1000,
		max_entry_proxy_tokens:
			manifest.budget_audit?.max_entry_proxy_tokens ?? 200,
		max_rules_bloat_tokens:
			manifest.budget_audit?.max_rules_bloat_tokens ?? 3000,
	};

	const auditReport = runBudgetAudit(projectRoot, config);

	console.log("\n== CRP Budget Audit ==\n");

	const findings = auditReport.findings as Array<Record<string, unknown>>;
	if (findings.length > 0) {
		for (const f of findings) {
			const severityLabel = `[${f.severity}]`;
			console.log(`${severityLabel.padEnd(10)} ${f.dimension}: ${f.message}`);
		}
	} else {
		console.log("[OK] No budget issues found");
	}

	console.log(
		`\nTotal markdown tokens: ${(auditReport.total_tokens as number).toLocaleString()}`,
	);
	const summary = auditReport.summary as Record<string, number>;
	console.log(`Warnings: ${summary.warnings}, Info: ${summary.infos}`);

	if (report) {
		writeFileSync(
			"budget-report.json",
			`${JSON.stringify(auditReport, null, 2)}\n`,
			"utf-8",
		);
		console.log("\nReport written to budget-report.json");
	}

	return summary.warnings > 0 ? 1 : 0;
}
