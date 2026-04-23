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
}

export interface SkillEntry {
	name: string;
	description?: string;
}
