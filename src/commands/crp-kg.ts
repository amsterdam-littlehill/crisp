import { queryKg } from "../lib/crp/kg-index";

export function cmdCrpKg(query: string): number {
	const result = queryKg(query);
	console.log(result);
	return 0;
}
