import { queryKg, queryKgStructured } from "../lib/crp/kg-index";

export function cmdCrpKg(
	query: string,
	options: { json?: boolean } = {},
): number {
	if (options.json) {
		const result = queryKgStructured(query);
		console.log(
			JSON.stringify(
				{
					topic: result.topic,
					matched: result.matched,
					truncated: result.truncated,
					totalTokens: result.totalTokens,
				},
				null,
				2,
			),
		);
		return 0;
	}
	const result = queryKg(query);
	console.log(result);
	return 0;
}
