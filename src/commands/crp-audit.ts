import { runCrpAudit } from "../lib/crp/audit";

export function cmdCrpAudit(): number {
	runCrpAudit();
	return 0;
}
