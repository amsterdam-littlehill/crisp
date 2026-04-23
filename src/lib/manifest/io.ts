import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import type { CrpManifest } from "./types";

export function loadManifest(path: string): Partial<CrpManifest> {
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return {};
	}

	const data = yaml.load(raw);
	return data && typeof data === "object" && !Array.isArray(data)
		? (data as Partial<CrpManifest>)
		: {};
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
