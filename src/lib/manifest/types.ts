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

export interface SkillEntry {
	name: string;
	description?: string;
}
