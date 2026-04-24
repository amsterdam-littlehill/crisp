# {{PROJECT}} — Gemini Agent Instructions

> Gemini uses `.gemini/` or inline instructions. This file serves as the Gemini-specific entry point.
> Canonical skill docs live under `.claude/skills/{{NAME}}/SKILL.md`.

## Quick Routing (survives context truncation)

| Task | Required reads | Workflow |
|------|---------------|----------|
| Fix bug | `rules/project-rules.md` + `rules/coding-standards.md` | `workflows/fix-bug.md` |
| Add feature | `rules/project-rules.md` + `rules/coding-standards.md` + `references/gotchas.md` | `workflows/add-feature.md` |
| Multi-subtask / long run | `rules/project-rules.md` | `workflows/update-rules.md` |
| <!-- FILL: task --> | <!-- FILL: files --> | <!-- FILL: workflow --> |
| **Other / unlisted** | `rules/project-rules.md` + `rules/coding-standards.md` | Check `workflows/` for closest match |

## Auto-Triggers

- **New task in same session** → re-read `.claude/skills/{{NAME}}/SKILL.md`, re-match Common Tasks route.
- **Before declaring any non-trivial task complete** → run Task Closure Protocol (see `.claude/skills/{{NAME}}/workflows/update-rules.md`)
- Skip only for: formatting-only, comment-only, dependency-version-only, behavior-preserving refactors

## Red Flags — STOP

- "Just this once I'll skip the AAR" → stop.
- "This is a small fix, no need to re-read SKILL.md" → stop. Context compression makes "small" fixes dangerous.
- Task declared "done" but no 30-second AAR scan → stop.
