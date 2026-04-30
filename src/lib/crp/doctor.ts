import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getEncoding } from "js-tiktoken";
import { hasInjectionBlock, readClaudeMd } from "./claude-md";
import { getDefaultAdapter } from "../hooks/adapter";

export interface DoctorCheck {
	name: string;
	status: "ok" | "fail" | "warn";
	message: string;
}

export async function runDoctorChecks(
	projectDir: string = process.cwd(),
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];

	// 1. Node.js runtime (hooks now use node, not bun)
	checks.push({
		name: "Node.js runtime",
		status: typeof process.versions.node !== "undefined" ? "ok" : "fail",
		message: typeof process.versions.node !== "undefined"
			? `Node.js ${process.versions.node}`
			: "Node.js not detected. CRP hooks require Node.js.",
	});

	// 2. .crp/ directory writable
	const crpDir = join(projectDir, ".crp");
	let crpWritable = false;
	if (existsSync(crpDir)) {
		try {
			const testFile = join(crpDir, ".doctor-write-test");
			writeFileSync(testFile, "test", "utf-8");
			unlinkSync(testFile);
			crpWritable = true;
		} catch {
			crpWritable = false;
		}
	}
	checks.push({
		name: ".crp/ directory",
		status: crpWritable ? "ok" : "fail",
		message: crpWritable ? "Writable" : `Not writable or missing: ${crpDir}`,
	});

	// 3. CLAUDE.md injection block
	const claudeMdContent = readClaudeMd(projectDir);
	if (claudeMdContent === null) {
		checks.push({
			name: "CLAUDE.md injection",
			status: "warn",
			message: "CLAUDE.md not found. Run 'crp init' to create it.",
		});
	} else if (hasInjectionBlock(claudeMdContent)) {
		checks.push({
			name: "CLAUDE.md injection",
			status: "ok",
			message: "CRP injection block present",
		});
	} else {
		checks.push({
			name: "CLAUDE.md injection",
			status: "warn",
			message: "CLAUDE.md exists but has no CRP injection block. Run 'crp init' to add one.",
		});
	}

	// 4. Hooks registered
	const adapter = getDefaultAdapter();
	const hookStatus = adapter.checkStatus(projectDir);
	const hooksOk = hookStatus.postReadActive;
	checks.push({
		name: "Hooks registered",
		status: hooksOk ? "ok" : "warn",
		message: hooksOk
			? `PostToolUse hook active (${adapter.name})`
			: `PostToolUse: ${hookStatus.postReadActive ? "yes" : "no"}`,
	});

	// 5. reads.jsonl recent records
	const readsPath = join(crpDir, "telemetry", "reads.jsonl");
	let readsStatus: "ok" | "warn" | "fail" = "warn";
	let readsMessage = "No reads.jsonl found";
	if (existsSync(readsPath)) {
		try {
			const stats = statSync(readsPath);
			if (stats.size > 0) {
				readsStatus = "ok";
				readsMessage = `${stats.size} bytes`;
			} else {
				readsStatus = "warn";
				readsMessage = "Empty file";
			}
		} catch {
			readsStatus = "warn";
			readsMessage = "Cannot stat reads.jsonl";
		}
	}
	checks.push({
		name: "Telemetry reads",
		status: readsStatus,
		message: readsMessage,
	});

	// 6. js-tiktoken available
	let tiktokenOk = false;
	try {
		getEncoding("cl100k_base");
		tiktokenOk = true;
	} catch {
		tiktokenOk = false;
	}
	checks.push({
		name: "js-tiktoken",
		status: tiktokenOk ? "ok" : "fail",
		message: tiktokenOk
			? "Available"
			: "Not installed. Token counts will be inaccurate.",
	});

	return checks;
}
