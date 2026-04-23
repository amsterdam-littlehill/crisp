import { runDoctorChecks } from "../lib/crp/doctor";

export async function cmdCrpDoctor(): Promise<number> {
	const checks = await runDoctorChecks();
	console.log("== CRP Doctor ==");
	console.log("");
	for (const check of checks) {
		const icon =
			check.status === "ok" ? "[✓]" : check.status === "warn" ? "[!]" : "[✗]";
		console.log(`${icon} ${check.name}: ${check.message}`);
	}
	const hasFail = checks.some((c) => c.status === "fail");
	return hasFail ? 1 : 0;
}
