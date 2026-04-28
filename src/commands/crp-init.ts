import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installHooks } from "../lib/crp/hooks/inject";
import { defaultManifest } from "../lib/manifest/defaults";
import { saveManifest } from "../lib/manifest/io";

export interface InitOptions {
	dryRun?: boolean;
	project?: string;
	description?: string;
}

export function cmdCrpInit(options: InitOptions = {}): number {
	const projectDir = process.cwd();
	const crpDir = join(projectDir, ".crp");
	const settingsPath = join(projectDir, ".claude", "settings.json");

	if (options.dryRun) {
		console.log("[DRY RUN] Would create .crp/ directory structure:");
		console.log("  .crp/routes.json");
		console.log("  .crp/kg/");
		console.log("  .crp/telemetry/");
		console.log("  .crp/hooks/");
		console.log("  .crp/cache/");
		console.log("  .crp/logs/");
		console.log("  .crp/crp.yaml");
		console.log("[DRY RUN] Would install hooks to .claude/settings.json");
		return 0;
	}

	// Create directory structure
	const dirs = [
		join(crpDir, "kg"),
		join(crpDir, "telemetry"),
		join(crpDir, "hooks"),
		join(crpDir, "cache"),
		join(crpDir, "logs"),
	];
	for (const dir of dirs) {
		mkdirSync(dir, { recursive: true });
	}

	// Copy hook scripts from package to .crp/hooks/
	const hookSrcDir = join(import.meta.dirname, "..", "lib", "crp", "hooks");
	const hookFiles = ["post-read.ts", "session-start.ts"];
	for (const file of hookFiles) {
		const src = join(hookSrcDir, file);
		const dst = join(crpDir, "hooks", file);
		if (existsSync(src) && !existsSync(dst)) {
			const content = readFileSync(src, "utf-8");
			writeFileSync(dst, content, "utf-8");
		}
	}

	// Create initial routes.json
	const routesPath = join(crpDir, "routes.json");
	if (!existsSync(routesPath)) {
		writeFileSync(
			routesPath,
			`${JSON.stringify({ version: 3, skills: [] }, null, 2)}\n`,
			"utf-8",
		);
	}

	// Create crp.yaml if not exists (root for backward compatibility)
	const rootYamlPath = join(projectDir, "crp.yaml");
	if (!existsSync(rootYamlPath)) {
		const manifest = defaultManifest(
			options.project || "my-project",
			options.description,
		);
		saveManifest(rootYamlPath, manifest);
	}

	// Mirror to .crp/crp.yaml
	const crpYamlPath = join(crpDir, "crp.yaml");
	if (!existsSync(crpYamlPath)) {
		const manifest = defaultManifest(
			options.project || "my-project",
			options.description,
		);
		saveManifest(crpYamlPath, manifest);
	}

	// Install hooks
	installHooks(projectDir, settingsPath);

	console.log("[CRP] Initialized successfully.");
	console.log("  .crp/ directory created");
	console.log("  Hooks installed to .claude/settings.json");
	console.log("  Run 'crp sync' after a few sessions to optimize.");
	return 0;
}
