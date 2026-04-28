import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Routes } from "../lib/crp/injection";
import { buildInjection } from "../lib/crp/injection";
import { loadManifest } from "../lib/manifest/io";
import type { CrpManifest } from "../lib/manifest/types";

export interface CheckOptions {
	ci?: boolean;
}

export function cmdCrpCheck(options: CheckOptions = {}): number {
	const projectDir = process.cwd();
	const crpDir = join(projectDir, ".crp");
	const routesPath = join(crpDir, "routes.json");
	const manifestPath = join(crpDir, "crp.yaml");

	const manifest = (loadManifest(manifestPath) || {}) as CrpManifest;
	const maxTokens = manifest.crp?.session_inject?.max_tokens ?? 300;

	let routes: Routes;
	try {
		routes = JSON.parse(readFileSync(routesPath, "utf-8")) as Routes;
	} catch {
		console.error("ERROR: routes.json not found. Run 'crp sync' first.");
		return 1;
	}

	const injection = buildInjection(routes, maxTokens);

	if (injection.truncated) {
		console.warn(
			`[WARN] Injection truncated. Dropped: ${injection.droppedSkills.join(", ")}`,
		);
		console.warn(`  Limit: ${maxTokens} tokens`);
		return options.ci ? 1 : 0;
	}

	console.log(`[OK] Injection fits within ${maxTokens} tokens`);
	return 0;
}
