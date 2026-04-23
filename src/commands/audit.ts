import { runAudit } from "../lib/audit/token-audit";
import { loadManifest } from "../lib/manifest/io";

export function cmdAudit(options: {
	skill?: string | null;
	report?: boolean;
}): number {
	const manifest = loadManifest("crp.yaml");
	const skills = manifest.skills || [];
	const useTiktoken = manifest.audit?.use_tiktoken ?? true;

	return runAudit(
		options.skill || null,
		skills,
		useTiktoken,
		options.report || false,
	);
}
