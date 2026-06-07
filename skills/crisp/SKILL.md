---
name: crisp
description: Use when a project should reduce Codex context usage with Context Router Protocol routing, when CRP scaffolding or token budget checks are requested, or when syncing CRP-generated agent instructions.
---

# CRISP

CRISP is the Context Router Protocol. Use it to keep project instructions compact, route Codex to only the task-relevant files, and audit the token cost of injected context.

## When to Use

- The user asks to reduce context tokens, context bloat, or repeated instruction loading.
- The user asks to install, initialize, sync, audit, check, or diagnose CRP.
- A project has `.crp/`, `crp.yaml`, `.codex/instructions.md`, or CRP injection markers.
- A task needs durable routing rules instead of reading large docs into the active conversation.

## Workflow

1. Inspect the project for `crp.yaml`, `.crp/routes.json`, and `.codex/instructions.md`.
2. For a new project, run `crp init --project <name>` from the project root.
3. After skills or routing docs change, run `crp sync`.
4. Before relying on injected context, run `crp check` to verify the session injection budget.
5. For maintenance, use `crp audit`, `crp status`, or `crp doctor` before changing rules.

## Codex Context Discipline

- Prefer `ctx_search`, `ctx_execute`, and `ctx_batch_execute` for large reads, searches, and analysis.
- Read only the CRP route or skill files required for the current task.
- Do not paste full telemetry, knowledge graph, or generated route files into the conversation.
- If context was cleared or compacted, re-read `.codex/instructions.md` and then follow its CRP route.

## Expected Files

- `.codex/instructions.md`: Codex-facing thin shell with the CRP injection block.
- `.crp/routes.json`: generated routing state.
- `crp.yaml`: project CRP manifest and token budget settings.
- `.claude/skills/<name>/SKILL.md`: canonical skill documents when a CRP project still stores shared skills under `.claude/skills`.

## Stop Conditions

- If `crp init` would overwrite unrelated user instructions, inspect the exact file first.
- If `crp check` reports truncation, reduce the injected routes or raise the budget only with user approval.
- If the project lacks Bun or the built `crp` binary, report the missing runtime before claiming CRP is installed.

