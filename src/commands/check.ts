import { runCheck } from "../lib/health/checker";

export function cmdCheck(options: {
	skill?: string | null;
	fix?: boolean;
	drifts?: boolean;
}): number {
	return runCheck(
		options.skill || null,
		options.fix || false,
		options.drifts || false,
	);
}
