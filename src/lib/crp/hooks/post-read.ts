#!/usr/bin/env bun
/**
 * post-read.ts — PostToolUse hook for CRP telemetry.
 *
 * CRITICAL: This hook must never throw exceptions.
 * stdout must always be empty or "{}" to avoid polluting Claude context.
 * All errors are logged to .crp/logs/hook-errors.jsonl
 */
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const CRP_DIR = join(PROJECT_DIR, ".crp");
export const TELEMETRY_DIR = join(CRP_DIR, "telemetry");
export const LOGS_DIR = join(CRP_DIR, "logs");
export const READS_PATH = join(TELEMETRY_DIR, "reads.jsonl");
export const ERROR_PATH = join(LOGS_DIR, "hook-errors.jsonl");

export function ensureDir(path: string): void {
	try {
		mkdirSync(path, { recursive: true });
	} catch {
		// ignore
	}
}

export function logError(
	message: string,
	errorPath: string = ERROR_PATH,
): void {
	try {
		ensureDir(dirname(errorPath));
		const record = `${JSON.stringify({
			ts: new Date().toISOString(),
			hook: "post-read",
			error: message,
		})}\n`;
		appendFileSync(errorPath, record, "utf-8");
	} catch {
		// can't even log the error
	}
}

export function estimateTokensQuick(filePath: string): number {
	// Day 1: crude estimate (will be replaced by js-tiktoken in Day 2)
	try {
		const stats = statSync(filePath);
		return Math.floor(stats.size / 4);
	} catch {
		return 0;
	}
}

export function isSkillFile(filePath: string): boolean {
	return (
		/[\\/]skills[\\/].*\.md$/.test(filePath) || filePath.endsWith(".skill.md")
	);
}

export interface ReadRecord {
	ts: string;
	session_id: string;
	file: string;
	tokens: number;
}

export function buildReadRecord(
	sessionId: string,
	filePath: string,
	tokens: number,
): ReadRecord {
	return {
		ts: new Date().toISOString(),
		session_id: sessionId,
		file: filePath,
		tokens,
	};
}

export function runPostRead(
	envInput: string | undefined,
	readsPath: string = READS_PATH,
	errorPath: string = ERROR_PATH,
): number {
	// Parse hook input from environment variable
	const rawInput = envInput || "{}";
	let input: Record<string, unknown>;
	try {
		input = JSON.parse(rawInput);
	} catch {
		logError("Failed to parse CLAUDE_HOOK_INPUT", errorPath);
		return 0;
	}

	const toolInput = (input.tool_input as Record<string, unknown>) || {};
	const filePath = String(toolInput.file_path || "");

	// Only record skill files
	if (!isSkillFile(filePath)) {
		return 0;
	}

	const sessionId = String(input.session_id || "unknown");
	const tokens = estimateTokensQuick(filePath);

	try {
		ensureDir(dirname(readsPath));
		const record = buildReadRecord(sessionId, filePath, tokens);
		appendFileSync(readsPath, `${JSON.stringify(record)}\n`, "utf-8");
	} catch (e) {
		logError(String(e), errorPath);
	}

	return 0;
}

// Script entry point
if (import.meta.main) {
	const exitCode = runPostRead(process.env.CLAUDE_HOOK_INPUT);
	// Use console.log to ensure stdout is flushed before exit
	console.log("{}");
	process.exit(exitCode);
}
