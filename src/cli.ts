#!/usr/bin/env node

import { Command } from "commander";
import { cmdCrpAudit } from "./commands/crp-audit";
import { cmdCrpCheck } from "./commands/crp-check";
import { cmdCrpDoctor } from "./commands/crp-doctor";
import { cmdCrpInit } from "./commands/crp-init";
import { cmdCrpQuality } from "./commands/crp-quality";
import { cmdCrpSync } from "./commands/crp-sync";
import { cmdCrpKg, cmdKgSync, cmdKgValidate } from "./commands/kg";
import { cmdLint } from "./commands/lint";
import { cmdSkillCreate, cmdSkillDelete, cmdSkillList } from "./commands/skill";
import { cmdSkillCheck } from "./commands/skill-check";
import { cmdStatus } from "./commands/status";
import { cmdTelemetryReport, cmdTelemetryStatus } from "./commands/telemetry";
import { cmdValidate } from "./commands/validate";

const program = new Command();

program.option("--json", "Output results as JSON");

// commander v13 does not pass program-level --json into subcommand action options;
// read it explicitly. Wraps actions to inject the flag + handle exit code.
function readJsonFlag(): boolean {
	return program.opts().json === true;
}
function runAction(
	fn: (
		opts: { json: boolean } & Record<string, unknown>,
		positionals: string[],
	) => number | Promise<number>,
) {
	// commander calls action handlers as (positional1, ..., options, command).
	// The second-to-last arg is the options object; preceding args are positionals.
	return async (...args: unknown[]) => {
		const optionsIdx = Math.max(args.length - 2, 0);
		const actionOpts = (args[optionsIdx] as Record<string, unknown>) || {};
		const positionals = args.slice(0, optionsIdx).map(String);
		const code = await fn({ ...actionOpts, json: readJsonFlag() }, positionals);
		if (code !== 0) process.exitCode = code;
	};
}

program
	.name("crp")
	.description("Context-Router Protocol (CRP) unified CLI")
	.version("0.5.0");

program
	.command("init")
	.description("Initialize CRP project (hooks, routes, telemetry)")
	.option("--project <name>", "Project name")
	.option("--description <text>", "Project description")
	.option("--dry-run", "Preview only")
	.action(
		runAction((opts) =>
			cmdCrpInit({
				project: opts.project as string | undefined,
				description: opts.description as string | undefined,
				dryRun: Boolean(opts.dryRun),
			}),
		),
	);

program
	.command("sync")
	.description("Analyze telemetry and regenerate routes.json")
	.option("--check", "Dry-run: preview route changes")
	.option("--include-user", "Include user-level skills in route generation")
	.action(
		runAction((opts) =>
			cmdCrpSync({
				check: Boolean(opts.check),
				includeUser: Boolean(opts.includeUser),
				json: opts.json,
			}),
		),
	);

program
	.command("check")
	.description("Verify injection fits within token budget")
	.option("--ci", "Exit 1 on truncation (for CI)")
	.action(
		runAction((opts) => cmdCrpCheck({ ci: Boolean(opts.ci), json: opts.json })),
	);

program
	.command("audit")
	.description("Show tier distribution and dead candidates")
	.action(runAction((opts) => cmdCrpAudit({ json: opts.json })));

program
	.command("doctor")
	.description("Diagnose environment and hook status")
	.action(runAction((opts) => cmdCrpDoctor({ json: opts.json })));

const skillCmd = program.command("skill").description("Skill management");

skillCmd
	.command("create <name>")
	.description("Create a new skill")
	.option("--description <text>", "Skill description")
	.option("--primary", "Mark as default skill")
	.action(
		runAction((opts, [name]) =>
			cmdSkillCreate({
				name,
				description: opts.description as string | undefined,
				primary: Boolean(opts.primary),
			}),
		),
	);

skillCmd
	.command("delete <name>")
	.description("Delete a skill")
	.option("--force", "Skip confirmation")
	.action(
		runAction((opts, [name]) =>
			cmdSkillDelete({ name, force: Boolean(opts.force) }),
		),
	);

skillCmd
	.command("check <name>")
	.description(
		"Validate a skill against the SkillSpec (replaces smoke-test.sh)",
	)
	.action(
		runAction((opts, [name]) => cmdSkillCheck(name, { json: opts.json })),
	);

skillCmd
	.command("list")
	.description("List skills")
	.action(runAction((opts) => cmdSkillList({ json: opts.json })));

const kgCmd = program.command("kg").description("Knowledge graph operations");

kgCmd
	.command("query <topic>")
	.description("Query KG index for a topic")
	.action(runAction((opts, [topic]) => cmdCrpKg(topic, { json: opts.json })));

kgCmd
	.command("sync")
	.description("Generate .crp-kg.json")
	.option("--skill <name>", "Target skill")
	.action(
		runAction((opts) => cmdKgSync({ skill: opts.skill as string | undefined })),
	);

kgCmd
	.command("validate <path>")
	.description("Validate .crp-kg.json")
	.action(runAction((_opts, [path]) => cmdKgValidate(path)));

const telemetryCmd = program
	.command("telemetry")
	.description("Telemetry operations");

telemetryCmd
	.command("status")
	.description("Show telemetry status")
	.action(runAction(() => cmdTelemetryStatus()));

telemetryCmd
	.command("report")
	.description("Generate telemetry report")
	.action(runAction((opts) => cmdTelemetryReport({ json: opts.json })));

program
	.command("status")
	.description("Show project status summary")
	.action(runAction((opts) => cmdStatus({ json: opts.json })));

program
	.command("validate")
	.description("Validate crp.yaml schema")
	.action(runAction((opts) => cmdValidate({ json: opts.json })));

program
	.command("quality <file>")
	.description(
		"Score a skill file for production readiness (8 dimensions, 0-10 scale)",
	)
	.action(
		runAction((opts, [file]) => cmdCrpQuality(file, { json: opts.json })),
	);

program
	.command("lint")
	.description("Run biome check on src/ and tests/")
	.action(runAction((opts) => cmdLint({ json: opts.json })));

program.parseAsync(process.argv).catch((err) => {
	console.error(err);
	process.exit(1);
});
