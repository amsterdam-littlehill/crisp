#!/usr/bin/env bun

import { Command } from "commander";
import { cmdAudit } from "./commands/audit";
import { cmdBudget } from "./commands/budget";
import { cmdCheck } from "./commands/check";
import { cmdInit } from "./commands/init";
import { cmdKgSync, cmdKgValidate } from "./commands/kg";
import { cmdSkillCreate, cmdSkillDelete, cmdSkillList } from "./commands/skill";
import { runSync } from "./commands/sync";
import {
	cmdTelemetryReport,
	cmdTelemetryStart,
	cmdTelemetryStatus,
	cmdTelemetryStop,
} from "./commands/telemetry";
import { cmdValidate } from "./commands/validate";

const program = new Command();

program
	.name("crp")
	.description("Context-Router Protocol (CRP) unified CLI")
	.version("1.0.0");

program
	.command("init")
	.description("Create crp.yaml + scaffold")
	.option("--from-existing", "Migrate existing project")
	.option("--skill <name>", "Initial skill name")
	.option("--project <name>", "Project name")
	.option("--shadow", "Preserve existing files")
	.option("--dry-run", "Preview only")
	.action((options) => {
		process.exit(cmdInit(options));
	});

const skillCmd = program.command("skill").description("Skill management");

skillCmd
	.command("create <name>")
	.description("Create a new skill")
	.option("--description <text>", "Skill description")
	.option("--primary", "Mark as default skill")
	.action((name, options) => {
		process.exit(cmdSkillCreate({ name, ...options }));
	});

skillCmd
	.command("delete <name>")
	.description("Delete a skill")
	.option("--force", "Skip confirmation")
	.action((name, options) => {
		process.exit(cmdSkillDelete({ name, ...options }));
	});

skillCmd
	.command("list")
	.description("List skills")
	.action(() => {
		process.exit(cmdSkillList());
	});

program
	.command("sync")
	.description("Regenerate gateway + proxies")
	.option("--skill <name>", "Target skill (optional)")
	.option("--check", "Dry-run")
	.action(async (options) => {
		process.exit(await runSync(options.skill, undefined, options.check));
	});

program
	.command("check")
	.description("Run health checks")
	.option("--skill <name>", "Target skill (optional)")
	.option("--fix", "Auto-fix minor issues")
	.option("--drifts", "Check structural drift")
	.action((options) => {
		process.exit(cmdCheck(options));
	});

program
	.command("audit")
	.description("Run token audit")
	.option("--skill <name>", "Target skill (optional)")
	.option("--report", "Write JSON report")
	.action((options) => {
		process.exit(cmdAudit(options));
	});

const kgCmd = program.command("kg").description("Knowledge graph operations");

kgCmd
	.command("sync")
	.description("Generate .crp-kg.json")
	.option("--skill <name>", "Target skill")
	.action((options) => {
		process.exit(cmdKgSync(options));
	});

kgCmd
	.command("validate <path>")
	.description("Validate .crp-kg.json")
	.action((path) => {
		process.exit(cmdKgValidate(path));
	});

program
	.command("budget")
	.description("Run budget audit")
	.option("--skill <name>", "Target skill")
	.option("--report", "Write JSON report")
	.action((options) => {
		process.exit(cmdBudget(options));
	});

const telemetryCmd = program
	.command("telemetry")
	.description("Telemetry operations");

telemetryCmd
	.command("start")
	.description("Start telemetry recording")
	.action(() => {
		process.exit(cmdTelemetryStart());
	});

telemetryCmd
	.command("stop")
	.description("Stop telemetry recording")
	.action(() => {
		process.exit(cmdTelemetryStop());
	});

telemetryCmd
	.command("status")
	.description("Show telemetry status")
	.action(() => {
		process.exit(cmdTelemetryStatus());
	});

telemetryCmd
	.command("report")
	.description("Generate telemetry report")
	.option("--skill <name>", "Target skill")
	.action((options) => {
		process.exit(cmdTelemetryReport(options));
	});

program
	.command("validate")
	.description("Validate crp.yaml schema")
	.action(() => {
		process.exit(cmdValidate());
	});

program.parse();
