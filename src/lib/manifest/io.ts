import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

// One cohesive manifest module: types + defaults + I/O. validate.ts is the
// deep validator and stays separate. Callers import everything from here.

// ─── Types ───

export interface CrpConfig {
	version: 3;
	session_inject: {
		max_tokens: number;
		include_kg_index: boolean;
	};
	tiers: {
		inline_threshold: number;
		hint_threshold: number;
	};
	telemetry: {
		window_days: number;
	};
	kg: {
		max_query_tokens: number;
		index_inline_tokens: number;
	};
}

export interface SkillEntry {
	name: string;
	description?: string;
}

export interface CrpManifest {
	project: {
		name: string;
		description?: string;
	};
	skills: SkillEntry[];
	default_skill?: string | null;
	checks?: {
		max_gateway_lines?: number;
		max_proxy_lines?: number;
	};
	audit?: {
		use_tiktoken?: boolean;
	};
	knowledge_graph?: {
		enabled?: boolean;
		max_tokens_execution?: number;
		max_tokens_synthesis?: number;
		max_tokens_cross_domain?: number;
		hot_cache_files?: string[];
	};
	budget_audit?: {
		max_gateway_tokens?: number;
		max_entry_proxy_tokens?: number;
		max_rules_bloat_tokens?: number;
	};
	crp?: CrpConfig;
}

// ─── Defaults ───

export const DEFAULT_MAX_GATEWAY_LINES = 100;
export const DEFAULT_MAX_PROXY_LINES = 60;
// Default session-inject budget. Single source for the `?? 300` fallback used
// across the injection writers (claude-md, codex-instructions, audit, the
// legacy session-start hook) and buildInjection's default param.
export const DEFAULT_SESSION_INJECT_TOKENS = 300;

export function defaultManifest(
	projectName: string = "",
	description: string = "",
): CrpManifest {
	const name = projectName || "my-project";
	return {
		project: {
			name,
			description: description || `${name} project`,
		},
		skills: [],
		default_skill: null,
		checks: {
			max_gateway_lines: DEFAULT_MAX_GATEWAY_LINES,
			max_proxy_lines: DEFAULT_MAX_PROXY_LINES,
		},
		audit: { use_tiktoken: true },
		crp: {
			version: 3,
			session_inject: {
				max_tokens: DEFAULT_SESSION_INJECT_TOKENS,
				include_kg_index: true,
			},
			tiers: {
				inline_threshold: 0.5,
				hint_threshold: 0.1,
			},
			telemetry: {
				window_days: 30,
			},
			kg: {
				max_query_tokens: 200,
				index_inline_tokens: 80,
			},
		},
	};
}

// ─── I/O ───

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
