#!/usr/bin/env node

import { Command } from "commander";
import { cmdCrpAudit } from "./commands/crp-audit";
import { cmdCrpCheck } from "./commands/crp-check";
import { cmdCrpDoctor } from "./commands/crp-doctor";
import { cmdCrpInit } from "./commands/crp-init";
import { cmdCrpKg } from "./commands/crp-kg";
import { cmdCrpSync } from "./commands/crp-sync";
import { cmdKgSync, cmdKgValidate } from "./commands/kg";
import { cmdSkillCreate, cmdSkillDelete, cmdSkillList } from "./commands/skill";
import { cmdStatus } from "./commands/status";
import {
	cmdTelemetryReport,
	cmdTelemetryStart,
	cmdTelemetryStatus,
	cmdTelemetryStop,
} from "./commands/telemetry";
import { cmdValidate } from "./commands/validate";

const program = new Command();

program.option("--json", "Output results as JSON");

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
	.action((options) => {
		const code = cmdCrpInit(options);
		if (code !== 0) process.exitCode = code;
	});

program
	.command("sync")
	.description("Analyze telemetry and regenerate routes.json")
	.option("--check", "Dry-run: preview route changes")
	.option("--include-user", "Include user-level skills in route generation")
	.action((options) => {
		const code = cmdCrpSync(options);
		if (code !== 0) process.exitCode = code;
	});

program
	.command("check")
	.description("Verify injection fits within token budget")
	.option("--ci", "Exit 1 on truncation (for CI)")
	.action((options) => {
		const code = cmdCrpCheck(options);
		if (code !== 0) process.exitCode = code;
	});

program
	.command("audit")
	.description("Show tier distribution and dead candidates")
	.action(() => {
		const code = cmdCrpAudit();
		if (code !== 0) process.exitCode = code;
	});

program
	.command("doctor")
	.description("Diagnose environment and hook status")
	.action(async () => {
		const code = await cmdCrpDoctor();
		if (code !== 0) process.exitCode = code;
	});

const skillCmd = program.command("skill").description("Skill management");

skillCmd
	.command("create <name>")
	.description("Create a new skill")
	.option("--description <text>", "Skill description")
	.option("--primary", "Mark as default skill")
	.action((name, options) => {
		const code = cmdSkillCreate({ name, ...options });
		if (code !== 0) process.exitCode = code;
	});

skillCmd
	.command("delete <name>")
	.description("Delete a skill")
	.option("--force", "Skip confirmation")
	.action((name, options) => {
		const code = cmdSkillDelete({ name, ...options });
		if (code !== 0) process.exitCode = code;
	});

skillCmd
	.command("list")
	.description("List skills")
	.action(() => {
		const code = cmdSkillList();
		if (code !== 0) process.exitCode = code;
	});

const kgCmd = program.command("kg").description("Knowledge graph operations");

kgCmd
	.command("query <topic>")
	.description("Query KG index for a topic")
	.action((topic) => {
		const code = cmdCrpKg(topic);
		if (code !== 0) process.exitCode = code;
	});

kgCmd
	.command("sync")
	.description("Generate .crp-kg.json")
	.option("--skill <name>", "Target skill")
	.action((options) => {
		const code = cmdKgSync(options);
		if (code !== 0) process.exitCode = code;
	});

kgCmd
	.command("validate <path>")
	.description("Validate .crp-kg.json")
	.action((path) => {
		const code = cmdKgValidate(path);
		if (code !== 0) process.exitCode = code;
	});

const telemetryCmd = program
	.command("telemetry")
	.description("Telemetry operations");

telemetryCmd
	.command("start")
	.description("Start telemetry recording")
	.action(() => {
		const code = cmdTelemetryStart();
		if (code !== 0) process.exitCode = code;
	});

telemetryCmd
	.command("stop")
	.description("Stop telemetry recording")
	.action(() => {
		const code = cmdTelemetryStop();
		if (code !== 0) process.exitCode = code;
	});

telemetryCmd
	.command("status")
	.description("Show telemetry status")
	.action(() => {
		const code = cmdTelemetryStatus();
		if (code !== 0) process.exitCode = code;
	});

telemetryCmd
	.command("report")
	.description("Generate telemetry report")
	.option("--skill <name>", "Target skill")
	.action((options) => {
		const code = cmdTelemetryReport(options);
		if (code !== 0) process.exitCode = code;
	});

program
	.command("status")
	.description("Show project status summary")
	.action(() => {
		const code = cmdStatus();
		if (code !== 0) process.exitCode = code;
	});

program
	.command("validate")
	.description("Validate crp.yaml schema")
	.action(() => {
		const code = cmdValidate();
		if (code !== 0) process.exitCode = code;
	});

program.parseAsync(process.argv).catch((err) => {
	console.error(err);
	process.exit(1);
});
