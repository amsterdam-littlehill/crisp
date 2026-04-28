import { green, red, yellow } from "../lib/cli/colors";
import { runDoctorChecks } from "../lib/crp/doctor";

export async function cmdCrpDoctor(): Promise<number> {
	const checks = await runDoctorChecks();
	console.log("== CRP Doctor ==");
	console.log("");
	for (const check of checks) {
		const icon =
			check.status === "ok"
				? green("[✓]")
				: check.status === "warn"
					? yellow("[!]")
					: red("[✗]");
		console.log(`${icon} ${check.name}: ${check.message}`);
	}
	const hasFail = checks.some((c) => c.status === "fail");
	return hasFail ? 1 : 0;
}
