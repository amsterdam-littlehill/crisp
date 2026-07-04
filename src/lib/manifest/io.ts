import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { CrpManifest } from "./types";

/** Canonical project manifest path. Single source of truth — all callers use this. */
export function manifestPath(projectDir: string = process.cwd()): string {
	return join(projectDir, "crp.yaml");
}

export class ManifestLoadError extends Error {
	constructor(
		public reason: "not-found" | "parse-error" | "invalid",
		message: string,
	) {
		super(message);
	}
}

export function loadManifest(path: string): Partial<CrpManifest> {
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return {};
	}

	let data: unknown;
	try {
		data = yaml.load(raw);
	} catch (e) {
		throw new ManifestLoadError(
			"parse-error",
			`Failed to parse ${path}: ${(e as Error).message}`,
		);
	}

	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new ManifestLoadError(
			"invalid",
			`Invalid manifest in ${path}: expected object, got ${Array.isArray(data) ? "array" : typeof data}`,
		);
	}

	return data as Partial<CrpManifest>;
}

export function saveManifest(path: string, data: CrpManifest): void {
	const yamlStr = yaml.dump(data, {
		indent: 2,
		lineWidth: -1,
		noRefs: true,
		sortKeys: false,
		flowLevel: -1,
	});
	writeFileSync(path, yamlStr, "utf-8");
}

export { validateManifest } from "./validate";
