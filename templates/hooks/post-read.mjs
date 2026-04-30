#!/usr/bin/env node
/**
 * post-read.mjs — PostToolUse hook for CRP telemetry.
 *
 * Node.js-compatible ESM script. Runs after every Read tool call.
 * Filters for skill files and logs telemetry to .crp/telemetry/reads.jsonl.
 *
 * CRITICAL: This hook must never throw exceptions.
 * stdout must always be empty or "{}" to avoid polluting Claude context.
 * All errors are logged to .crp/logs/hook-errors.jsonl
 */
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CRP_DIR = join(PROJECT_DIR, ".crp");
const TELEMETRY_DIR = join(CRP_DIR, "telemetry");
const LOGS_DIR = join(CRP_DIR, "logs");
const READS_PATH = join(TELEMETRY_DIR, "reads.jsonl");
const ERROR_PATH = join(LOGS_DIR, "hook-errors.jsonl");

function ensureDir(path) {
	try {
		mkdirSync(path, { recursive: true });
	} catch {
		// ignore
	}
}

function logError(message, errorPath = ERROR_PATH) {
	try {
		ensureDir(dirname(errorPath));
		const record = JSON.stringify({
			ts: new Date().toISOString(),
			hook: "post-read",
			error: message,
		}) + "\n";
		appendFileSync(errorPath, record, "utf-8");
	} catch {
		// can't even log the error
	}
}

function estimateTokensQuick(filePath) {
	try {
		const stats = statSync(filePath);
		return Math.floor(stats.size / 4);
	} catch {
		return 0;
	}
}

function isSkillFile(filePath) {
	return /[\\/]skills[\\/].*\.md$/.test(filePath) || filePath.endsWith(".skill.md");
}

function runPostRead(envInput) {
	const rawInput = envInput || "{}";
	let input;
	try {
		input = JSON.parse(rawInput);
	} catch {
		logError("Failed to parse CLAUDE_HOOK_INPUT");
		return 0;
	}

	const toolInput = input.tool_input || {};
	const filePath = String(toolInput.file_path || "");

	if (!isSkillFile(filePath)) {
		return 0;
	}

	const sessionId = String(input.session_id || "unknown");
	const tokens = estimateTokensQuick(filePath);

	try {
		ensureDir(dirname(READS_PATH));
		const record = JSON.stringify({
			ts: new Date().toISOString(),
			session_id: sessionId,
			file: filePath,
			tokens,
		}) + "\n";
		appendFileSync(READS_PATH, record, "utf-8");
	} catch (e) {
		logError(String(e));
	}

	return 0;
}

const exitCode = runPostRead(process.env.CLAUDE_HOOK_INPUT);
console.log("{}");
process.exit(exitCode);
