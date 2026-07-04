import { readFileSync } from "node:fs";
import { join } from "node:path";
import { printError, printOk, printWarn } from "../lib/cli/format";
import type { Routes } from "../lib/crp/injection";
import { buildInjection } from "../lib/crp/injection";
import { loadManifest, manifestPath } from "../lib/manifest/io";

export interface CheckOptions {
	ci?: boolean;
	json?: boolean;
}

export function cmdCrpCheck(options: CheckOptions = {}): number {
	const projectDir = process.cwd();
	const crpDir = join(projectDir, ".crp");
	const routesPath = join(crpDir, "routes.json");

	const manifest = loadManifest(manifestPath(projectDir));
	const maxTokens = manifest.crp?.session_inject?.max_tokens ?? 300;

	let routes: Routes;
	try {
		routes = JSON.parse(readFileSync(routesPath, "utf-8")) as Routes;
	} catch {
		if (options.json) {
			console.log(
				JSON.stringify(
					{ error: "routes.json not found", withinBudget: false, maxTokens },
					null,
					2,
				),
			);
			return 1;
		}
		printError(
			"routes.json not found",
			"Cannot verify injection",
			"Run 'crp sync' first.",
		);
		return 1;
	}

	const injection = buildInjection(routes, maxTokens);

	if (options.json) {
		console.log(
			JSON.stringify(
				{
					withinBudget: !injection.truncated,
					maxTokens,
					truncated: injection.truncated,
					droppedSkills: injection.droppedSkills,
				},
				null,
				2,
			),
		);
		return injection.truncated && options.ci ? 1 : 0;
	}

	if (injection.truncated) {
		printWarn(
			`Injection truncated. Dropped: ${injection.droppedSkills.join(", ")}`,
		);
		printWarn(`  Limit: ${maxTokens} tokens`);
		return options.ci ? 1 : 0;
	}

	printOk(`Injection fits within ${maxTokens} tokens`);
	return 0;
}
