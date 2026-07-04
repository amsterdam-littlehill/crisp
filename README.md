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
- Audit token usage and tier distribution across the rule system
- Build and validate a knowledge graph from CRP structures
- Track telemetry logs and hook status
- Verify injection fits within token budget
- Native Claude Code plugin: auto-generate `CLAUDE.md` and hooks

## Claude Code Plugin

CRP provides first-class integration with **Claude Code** (the CLI, desktop, and IDE extensions). When you run `crp init` or `crp sync`, the CLI automatically:

- Generates or updates `CLAUDE.md` with your project's CRP routing rules, skills, and tier configuration
- Injects a `PostToolUse` hook into `~/.claude/settings.json` to capture `Read` events for telemetry
- Writes a `post-read.mjs` hook script that records file reads to `.crp/telemetry/reads.jsonl`

This means Claude Code sessions automatically respect your project's context governance without manual copy-paste.

### How it works

1. **CLAUDE.md generation** — `crp init` creates a `CLAUDE.md` file in your project root. It includes:
   - Project name and description from `crp.yaml`
   - Skill routing table (which files map to which skill)
   - Tier definitions (hot, warm, cold, L0–L4)
   - Markdown markers (`<!-- CRP_INJECT_START/END -->`) so re-running `crp sync` updates only the injected section

2. **Hook injection** — `crp init` detects whether you use Claude Code CLI or Claude Desktop and writes the correct hook format:
   - **Claude Code CLI**: nested `hooks` array in `settings.json`
   - **Claude Desktop**: flat `hooks` object in `settings.local.json`

3. **Telemetry** — Every `Read` tool call in Claude Code triggers the hook, which logs:
   - Timestamp, session ID, file path, and token estimate
   - Data is written to `.crp/telemetry/reads.jsonl` and read by `crp telemetry report`

### Manual setup (if you skipped init)

```bash
# Generate CLAUDE.md only
bun run src/cli.ts sync --claude-md

# Check hook status
bun run src/cli.ts doctor

# View telemetry report
bun run src/cli.ts telemetry report
```

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
bun run src/cli.ts init --project my-app
```

### 5. Run a check

```bash
bun run src/cli.ts check
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
| `check` | Verify injection fits within token budget |
| `audit` | Show tier distribution and dead candidates |
| `kg` | Sync or validate the CRP knowledge graph |
| `doctor` | Diagnose environment and hook status |
| `telemetry` | Inspect or report telemetry |
| `validate` | Validate crp.yaml schema |
| `status` | Show project status summary |
| `quality <file>` | Score a skill file for production readiness (8 dimensions) |

For detailed flags, use `bun run src/cli.ts <command> --help`.

## Core modules

These TypeScript modules implement the current toolkit surface:

| Module | Responsibility |
|---|---|
| `src/cli.ts` | Unified CLI entry point |
| `src/commands/crp-init.ts` | v3 project scaffolding (hooks, routes, telemetry) |
| `src/commands/crp-sync.ts` | Telemetry analysis and routes regeneration |
| `src/commands/crp-check.ts` | Injection token budget verification |
| `src/commands/crp-audit.ts` | Tier distribution and dead candidate detection |
| `src/commands/crp-kg.ts` | kg query action (KG topic lookup) |
| `src/commands/crp-doctor.ts` | Environment and hook status diagnosis |
| `src/commands/skill.ts` | Skill creation, deletion, and listing |
| `src/commands/kg.ts` | kg sync / kg validate actions |
| `src/commands/telemetry.ts` | Telemetry status and reporting |
| `src/commands/validate.ts` | crp.yaml schema validation |
| `src/lib/manifest/` | Manifest I/O, validation, and frontmatter extraction |
| `src/lib/crp/` | v3 core: routing, injection, audit, hooks |
| `src/lib/kg/` | Knowledge graph extraction, validation, and generation |
| `src/lib/telemetry/` | Telemetry reporting |

## Configuration

`crp.yaml` is the main project configuration file. It defines project metadata, skill configuration, thresholds, and audit settings.

`package.json` defines the Bun project metadata and the test and lint tooling used in this repository.

## Testing and quality checks

This repository uses `bun test` for tests and `biome` for linting.

```bash
bun test
bun run lint
```

The `tests/` directory includes coverage for core modules such as CRP routing, injection, audit, knowledge graph sync, telemetry hooks, manifest validation, and integration behavior.

## Platform Support

- **Runtime**: Bun (required for `bun test` and `bun run`)
- **AI Assistant**: Claude Code CLI, Claude Desktop, and Claude IDE extensions
  - Hooks target `~/.claude/settings.json` (CLI) or `~/.claude/settings.local.json` (Desktop)
  - Auto-generated `CLAUDE.md` is picked up automatically by all Claude Code clients
- Other platforms may work but are not currently supported.

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
