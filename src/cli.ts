#!/usr/bin/env bun

import { Command } from "commander";
import { cmdCrpAudit } from "./commands/crp-audit";
import { cmdCrpCheck } from "./commands/crp-check";
import { cmdCrpDoctor } from "./commands/crp-doctor";
import { cmdCrpInit } from "./commands/crp-init";
import { cmdCrpKg } from "./commands/crp-kg";
import { cmdCrpSync } from "./commands/crp-sync";
import { cmdKgSync, cmdKgValidate } from "./commands/kg";
import { cmdSkillCreate, cmdSkillDelete, cmdSkillList } from "./commands/skill";
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
	.description("Initialize CRP project (hooks, routes, telemetry)")
	.option("--project <name>", "Project name")
	.option("--description <text>", "Project description")
	.option("--dry-run", "Preview only")
	.action((options) => {
		process.exit(cmdCrpInit(options));
	});

program
	.command("sync")
	.description("Analyze telemetry and regenerate routes.json")
	.option("--check", "Dry-run: preview route changes")
	.option("--include-user", "Include user-level skills in route generation")
	.action((options) => {
		process.exit(cmdCrpSync(options));
	});

program
	.command("check")
	.description("Verify injection fits within token budget")
	.option("--ci", "Exit 1 on truncation (for CI)")
	.action((options) => {
		process.exit(cmdCrpCheck(options));
	});

program
	.command("audit")
	.description("Show tier distribution and dead candidates")
	.action(() => {
		process.exit(cmdCrpAudit());
	});

program
	.command("doctor")
	.description("Diagnose environment and hook status")
	.action(async () => {
		process.exit(await cmdCrpDoctor());
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

const kgCmd = program.command("kg").description("Knowledge graph operations");

kgCmd
	.command("query <topic>")
	.description("Query KG index for a topic")
	.action((topic) => {
		process.exit(cmdCrpKg(topic));
	});

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
