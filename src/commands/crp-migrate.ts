import { runMigration } from "../lib/crp/migrate";

export interface MigrateOptions {
	apply?: boolean;
}

export function cmdCrpMigrate(options: MigrateOptions = {}): number {
	const result = runMigration(process.cwd(), {
		dryRun: !options.apply,
		apply: options.apply,
	});
	return result.success ? 0 : 1;
}
