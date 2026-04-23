# {{PROJECT}} — Gemini Agent Instructions

> Gemini uses `.gemini/` or inline instructions. This file serves as the Gemini-specific entry point.
> Canonical skill docs live under `.claude/skills/{{NAME}}/SKILL.md`.

## Quick Routing (survives context truncation)

| Task | Required reads | Workflow |
|------|---------------|----------|
| Fix bug | `.claude/skills/{{NAME}}/rules/project-rules.md` + `coding-standards.md` | `.claude/skills/{{NAME}}/workflows/fix-bug.md` |
| Add feature | `.claude/skills/{{NAME}}/rules/project-rules.md` + `coding-standards.md` | `.claude/skills/{{NAME}}/workflows/add-feature.md` |
| Multi-subtask / long run | `.claude/skills/{{NAME}}/rules/project-rules.md` | `.claude/skills/{{NAME}}/workflows/update-rules.md` |
| <!-- FILL: add your common task --> | <!-- FILL: required reads --> | <!-- FILL: workflow path --> |
| Other / unlisted | `.claude/skills/{{NAME}}/rules/project-rules.md` | Check `.claude/skills/{{NAME}}/workflows/` for closest match |

## Auto-Triggers

- **New task in same session** → re-read `.claude/skills/{{NAME}}/SKILL.md`, re-match Common Tasks route.
- **Before declaring any non-trivial task complete** → run Task Closure Protocol (see `.claude/skills/{{NAME}}/workflows/update-rules.md`)
- Skip only for: formatting-only, comment-only, dependency-version-only, behavior-preserving refactors

## Red Flags — STOP

- "Just this once I'll skip the AAR" → stop.
- "This is a small fix, no need to re-read SKILL.md" → stop. Context compression makes "small" fixes dangerous.
- Task declared "done" but no 30-second AAR scan → stop.
