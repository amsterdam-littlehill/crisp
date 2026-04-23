import { runBudgetCmd } from "../lib/budget/analyzer";

export function cmdBudget(options: {
	skill?: string | null;
	report?: boolean;
}): number {
	return runBudgetCmd(options.skill || null, options.report || false);
}
