import type { CrpManifest } from "./types";

export const DEFAULT_MAX_GATEWAY_LINES = 100;
export const DEFAULT_MAX_PROXY_LINES = 60;

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
	};
}
