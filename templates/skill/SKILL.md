---
name: {{NAME}}
description: >
  <!-- FILL: Trigger conditions — this is the skill's lifeline. Must cover all
       plausible user phrasings. Models naturally under-trigger, so description
       must be active and broad.
       Example:
       "{{PROJECT}} backend development assistant. Activate when user mentions
       API, endpoints, controllers, service layer, database, bug fixes,
       feature additions, or refactoring. Covers Python, FastAPI, SQLAlchemy."
  -->
primary: true
---

# {{NAME}} — Skill Navigation Center

> SKILL.md is NOT an encyclopedia. It is a table of contents. Only write
> "what to read / when to read it".

---

## Zone 1: Attention Sink (first 4 tokens = highest attention)

**Project**: {{PROJECT}} | **Architecture**: <!-- FILL: one-line architecture -->

---

## Zone 2: Stable Prefix (KV-cacheable, changes rarely)

### System Identity

- **Decision**: Structure serves content — do NOT build empty scaffolding for completeness
- **Decision**: Activation beats storage — pitfalls must appear on the task path
- **Decision**: Precision edits only — every line must trace to a user ask
- **Decision**: Session Discipline — on a new task, ALWAYS re-read SKILL.md and re-walk the route

---

## Zone 3: Near Top — Explicit State (live_state)

### Current Decisions

<!-- FILL: Active architectural decisions. Format:
- **Decision**: <what>
  - **Rationale**: <why>
  - **Status**: active | superseded | pending
  - **Impact**: <files affected>
-->

### File State Map

<!-- Auto-updated by artifact tracker. Format:
| File | Last modified | Status |
|------|--------------|--------|
-->

---

## Zone 4: Upper-Middle — Failure Log

### Known Gotchas (one-liner + anchor, highest pitfall density)

- <!-- FILL: one-line pitfall + `references/gotchas.md#anchor` -->
- <!-- FILL: one-line pitfall + `references/gotchas.md#anchor` -->

---

## Zone 5: Middle — Compressed Knowledge

### Common Tasks (route by task type, 5–10 entries + fallback)

| Task | Must read | Workflow |
|------|-----------|----------|
| Fix bug | `rules/project-rules.md` + `rules/coding-standards.md` | `workflows/fix-bug.md` |
| Add feature | `rules/project-rules.md` + `rules/coding-standards.md` + `references/gotchas.md` | `workflows/add-feature.md` |
| Multi-subtask / long run (>=3 independent subtasks) | `rules/project-rules.md` | `workflows/update-rules.md` |
| <!-- FILL: task --> | <!-- FILL: files --> | <!-- FILL: workflow --> |
| **Other / unlisted** | `rules/project-rules.md` + `rules/coding-standards.md` | Check `workflows/` for closest match |

---

## Zone 6: Near End — Sacred Recent (immutable, last 10 turns)

<!-- Reserved: current task context. Do NOT pre-fill. -->

---

## Zone 7: Very End — Highest Attention (objectives)

### Current Objective

<!-- FILL: task description + success criteria + next actions -->

### Verification

Ask yourself: "Did I read exactly the files listed for this task's
Common Tasks route?" If ANY discrepancy, stop and re-walk the route.
