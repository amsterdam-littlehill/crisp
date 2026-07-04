import { spawnSync } from "node:child_process";
import { emitJson } from "../lib/cli/format";

export interface LintOptions {
	json?: boolean;
}

export interface LintSummary {
	files: string[];
	errors: number;
	warnings: number;
}

// Wraps `biome check` on src/ and tests/. Biome is a devDependency of this repo;
// consumers running `crp lint` in their own projects must have biome available.
// Degrades gracefully (exit 2 + message) when biome is missing instead of crashing.
export function cmdLint(options: LintOptions = {}): number {
	// spawnSync does not throw on a missing binary — it returns { error: <ENOENT> }.
	const spawned = spawnSync(
		"bunx",
		["biome", "check", "src/", "tests/", "--reporter=json"],
		{ encoding: "utf-8" },
	);
	if (spawned.error) {
		console.error(
			"crp lint: biome not available. Is @biomejs/biome installed?",
		);
		return 2;
	}
	if (spawned.status === null) {
		console.error("crp lint: biome terminated abnormally.");
		return 2;
	}

	let parsed: {
		summary?: { errors?: number; warnings?: number };
		diagnostics?: { location?: { path?: string } }[];
	};
	try {
		// biome on Windows emits path strings with raw backslashes (e.g. "src\commands\lint.ts"),
		// which is invalid JSON (a lone backslash is not a valid escape). Normalize every backslash
		// to "/" — safe because we only consume paths and counts; any backslash in a diagnostic
		// description is not surfaced, so corrupting it to "/" is harmless.
		parsed = JSON.parse(spawned.stdout.replace(/\\/g, "/"));
	} catch {
		console.error("crp lint: could not parse biome JSON output.");
		return 2;
	}

	const files = [
		...new Set(
			(parsed.diagnostics ?? [])
				.map((d) => d.location?.path)
				.filter((p): p is string => !!p),
		),
	];
	const summary: LintSummary = {
		files,
		errors: parsed.summary?.errors ?? 0,
		warnings: parsed.summary?.warnings ?? 0,
	};

	if (options.json) {
		emitJson(summary);
	} else {
		console.log("== CRP Lint ==");
		console.log(`Files with issues: ${summary.files.length}`);
		console.log(`Errors: ${summary.errors}, Warnings: ${summary.warnings}`);
		if (summary.files.length > 0) {
			for (const f of summary.files) console.log(`  - ${f}`);
		}
	}
	return summary.errors > 0 ? 1 : 0;
}
