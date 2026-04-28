#!/usr/bin/env bun
/**
 * session-start.ts — SessionStart hook for CRP.
 *
 * Reads .crp/routes.json and generates a compressed injection prompt.
 * Output is limited to max_tokens from crp.yaml config.
 * If routes.json does not exist, prints a fallback message.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Routes } from "../injection";
import { buildInjection as buildInjectionImpl } from "../injection";

export const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const ROUTES_PATH = join(PROJECT_DIR, ".crp", "routes.json");

export function buildFallbackMessage(): string {
	return "[CRP] Context router active. Run 'crp sync' after a few sessions to optimize.";
}

export function buildInjection(routes: Routes): string {
	return buildInjectionImpl(routes, 300).text;
}

export function runSessionStart(routesPath: string = ROUTES_PATH): string {
	if (!existsSync(routesPath)) {
		return buildFallbackMessage();
	}

	let routes: Routes;
	try {
		routes = JSON.parse(readFileSync(routesPath, "utf-8")) as Routes;
	} catch {
		return buildFallbackMessage();
	}

	if (!routes.skills || routes.skills.length === 0) {
		return buildFallbackMessage();
	}

	return buildInjection(routes);
}

// Script entry point
if (import.meta.main) {
	const output = runSessionStart();
	console.log(output);
}
