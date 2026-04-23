<!-- Banner -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/amsterdam-littlehill/crisp/master/.github/images/banner_crisp_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/amsterdam-littlehill/crisp/master/.github/images/banner_crisp_light.png">
    <img alt="crisp - Context Router Protocol" src="https://raw.githubusercontent.com/amsterdam-littlehill/crisp/master/.github/images/banner_crisp_dark.png" width="800">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/amsterdam-littlehill/crisp/blob/main/LICENSE"><img src="https://img.shields.io/github/license/amsterdam-littlehill/crisp?style=flat-square&color=8b949e"></a>
</p>

<p align="center">
  <b>Context Router Protocol</b> — a Bun + TypeScript toolkit for context governance, routing, auditing, and observability in AI-assisted development.<br>
  <sub>Single codebase · Unified CLI · Quick start for first-time users</sub>
</p>

---

[English](README.md) | [中文](README.zh.md)

## What this project is

crisp is a single Bun + TypeScript implementation of the Context Router Protocol (CRP). It helps teams structure AI collaboration rules, keep them synchronized across tool entrypoints, inspect token and budget costs, and track knowledge, telemetry, and session behavior over time.

## What it does

- Initialize CRP scaffolding for a project with a unified CLI
- Create, list, and manage skills and their routing structure
- Sync generated entry files and shell-facing artifacts
- Audit token usage and budget dimensions across the rule system
- Build and validate a knowledge graph from CRP structures
- Track session state, artifacts, reflection output, and telemetry logs
- Run health checks, drift checks, and repository validation

## Repository layout

```text
.
├── src/                      # TypeScript source (lib + commands)
│   ├── cli.ts                # Unified CLI entry point
│   ├── commands/             # CLI subcommand modules
│   └── lib/                  # Core library modules
├── tests/                    # Bun test suites
├── templates/                # Skill and shell templates
├── crp.yaml                  # Project configuration and thresholds
├── package.json              # Bun project metadata
├── tsconfig.json             # TypeScript configuration
├── install.sh                # One-line installer
└── docs/                     # Supporting specs and plans
```

## Quick start

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install dependencies

```bash
bun install
```

### 3. Inspect the unified CLI

```bash
bun run src/cli.ts --help
```

### 4. Initialize a project

```bash
bun run src/cli.ts init --skill backend --project my-app
```

### 5. Run a health check

```bash
bun run src/cli.ts check --drifts
```

### 6. Run tests

```bash
bun test
```

## CLI commands

The main entrypoint is `src/cli.ts`. Current command groups include:

| Command | Purpose |
|---|---|
| `init` | Initialize CRP scaffolding for a project |
| `skill` | Create, delete, or list skills |
| `sync` | Regenerate synced shell and entrypoint artifacts |
| `check` | Run health checks and drift detection |
| `audit` | Audit token usage and related reports |
| `kg` | Sync or validate the CRP knowledge graph |
| `budget` | Run the budget analysis workflow |
| `telemetry` | Start, stop, inspect, or report telemetry |
| `validate` | Run repository-level validation |

For detailed flags, use `bun run src/cli.ts <command> --help`.

## Core modules

These TypeScript modules implement the current toolkit surface:

| Module | Responsibility |
|---|---|
| `src/cli.ts` | Unified CLI entry point |
| `src/commands/init.ts` | Project scaffolding and initialization |
| `src/commands/skill.ts` | Skill creation, deletion, and listing |
| `src/commands/sync.ts` | Shell and entrypoint synchronization |
| `src/commands/check.ts` | Health checks and drift detection |
| `src/commands/audit.ts` | Token estimation and audit reporting |
| `src/commands/kg.ts` | Knowledge graph sync and validation |
| `src/commands/budget.ts` | Budget analysis across CRP dimensions |
| `src/commands/telemetry.ts` | Telemetry lifecycle and reporting |
| `src/commands/validate.ts` | crp.yaml schema validation |
| `src/lib/manifest/` | Manifest I/O, validation, and frontmatter extraction |
| `src/lib/gateway/` | Gateway generation and Common Tasks parsing |
| `src/lib/health/` | Health checks, drift detection, and quality scoring |
| `src/lib/audit/` | Token audit and benchmark simulation |
| `src/lib/kg/` | Knowledge graph extraction, validation, and generation |
| `src/lib/sync/` | Shell and multi-skill synchronization |
| `src/lib/budget/` | Budget analysis calculator |
| `src/lib/telemetry/` | Telemetry hooks, logging, and reporting |

## Configuration

`crp.yaml` is the main project configuration file. It defines project metadata, skill configuration, thresholds, and audit settings.

`package.json` defines the Bun project metadata and the test and lint tooling used in this repository.

## Testing and quality checks

This repository uses `bun test` for tests and `biome` for linting.

```bash
bun test
bun run lint
```

The `tests/` directory includes coverage for core modules such as budget analysis, knowledge graph sync, reflector logic, session tracking, health checks, and integration behavior.

## Current status and compatibility

- This repository is documented as a single current Bun + TypeScript implementation
- The README content is aligned to the current CLI and module surface
- Historical multi-version evolution is intentionally omitted from the top-level onboarding path
- Supporting design and planning documents remain under `docs/superpowers/`

## Contributing

If you want to contribute, start by running the local checks before opening a change:

```bash
bun test
bun run lint
bun run src/cli.ts validate
```

See `CONTRIBUTING.md` for contribution details.

## License

Released under the MIT License. See `LICENSE` for details.
