import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkHookStatus } from "./hooks/inject";

export interface DoctorCheck {
	name: string;
	status: "ok" | "fail" | "warn";
	message: string;
}

export async function runDoctorChecks(
	projectDir: string = process.cwd(),
): Promise<DoctorCheck[]> {
	const checks: DoctorCheck[] = [];

	// 1. Bun runtime
	const hasBun = typeof process.versions.bun !== "undefined";
	checks.push({
		name: "Bun runtime",
		status: hasBun ? "ok" : "fail",
		message: hasBun
			? `Bun ${process.versions.bun}`
			: "Bun not detected. CRP hooks require Bun.",
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

	// 3. Hooks registered
	const settingsPath = join(projectDir, ".claude", "settings.json");
	const hookStatus = checkHookStatus(settingsPath);
	const hooksOk = hookStatus.postReadActive && hookStatus.sessionStartActive;
	checks.push({
		name: "Hooks registered",
		status: hooksOk ? "ok" : "warn",
		message: hooksOk
			? "PostToolUse and SessionStart hooks active"
			: `PostToolUse: ${hookStatus.postReadActive ? "yes" : "no"}, SessionStart: ${hookStatus.sessionStartActive ? "yes" : "no"}`,
	});

	// 4. reads.jsonl recent records
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

	// 5. js-tiktoken available
	let tiktokenOk = false;
	try {
		const tiktoken = (await import("js-tiktoken")) as {
			getEncoding?: unknown;
		};
		if (tiktoken.getEncoding) {
			tiktokenOk = true;
		}
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
